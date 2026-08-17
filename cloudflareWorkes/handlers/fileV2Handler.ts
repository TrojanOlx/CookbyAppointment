import { checkRateLimit, requireFamilyContext, writeAudit } from '../core/auth';
import { ApiError, json, pagination, readJson } from '../core/http';
import { withOperationLock } from '../core/operationLock';
import type { Env, FamilyContext } from '../core/types';

const encoder = new TextEncoder();
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
]);

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function signingKey(env: Env): Promise<CryptoKey> {
  const secret = env.FILE_SIGNING_SECRET || env.WX_SECRET;
  if (!secret) throw new ApiError(503, 'FILE_SIGNING_UNAVAILABLE', '文件签名服务未配置');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signature(env: Env, fileId: string, familyId: string, expires: number): Promise<string> {
  const value = `${fileId}.${familyId}.${expires}`;
  const signed = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signed));
}

async function verifySignature(env: Env, fileId: string, familyId: string, expires: number, provided: string): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 15 * 60 * 1000) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC', await signingKey(env), base64UrlToBytes(provided).buffer as ArrayBuffer, encoder.encode(`${fileId}.${familyId}.${expires}`),
    );
  } catch {
    return false;
  }
}

export async function createFileAccessPath(env: Env, fileId: string, familyId: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const expires = Date.now() + Math.min(10 * 60 * 1000, Math.max(30 * 1000, ttlMs));
  const signed = await signature(env, fileId, familyId, expires);
  return `/api/file/download?id=${encodeURIComponent(fileId)}&expires=${expires}&signature=${encodeURIComponent(signed)}`;
}

export function createStableFilePath(fileId: string): string {
  return `/api/file/download?id=${encodeURIComponent(fileId)}`;
}

export function fileIdFromAccessUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://files.internal');
    if (url.pathname !== '/api/file/download') return null;
    return url.searchParams.get('id');
  } catch {
    return null;
  }
}

export async function createAbsoluteFileAccessUrl(
  request: Request,
  env: Env,
  fileId: string,
  familyId: string,
  ttlMs = 5 * 60 * 1000,
): Promise<string> {
  return new URL(await createFileAccessPath(env, fileId, familyId, ttlMs), request.url).toString();
}

const IMAGE_REFERENCE_KEYS = new Set(['avatarUrl', 'userAvatar', 'dishImage', 'image', 'images']);

function collectFileReferences(value: unknown, key: string | null, ids: Set<string>): void {
  if (typeof value === 'string') {
    if (key && IMAGE_REFERENCE_KEYS.has(key)) {
      const id = fileIdFromAccessUrl(value);
      if (id) ids.add(id);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFileReferences(item, key, ids);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    collectFileReferences(childValue, childKey, ids);
  }
}

function replaceFileReferences(value: unknown, key: string | null, urls: Map<string, string>): unknown {
  if (typeof value === 'string') {
    if (!key || !IMAGE_REFERENCE_KEYS.has(key)) return value;
    const id = fileIdFromAccessUrl(value);
    return id ? (urls.get(id) || '') : value;
  }
  if (Array.isArray(value)) return value.map(item => replaceFileReferences(item, key, urls));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([childKey, childValue]) => [childKey, replaceFileReferences(childValue, childKey, urls)]));
}

export async function decorateFamilyFileReferences(
  request: Request,
  env: Env,
  response: Response,
): Promise<Response> {
  if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) return response;
  let data: unknown;
  try {
    data = await response.clone().json();
  } catch {
    return response;
  }
  const ids = new Set<string>();
  collectFileReferences(data, null, ids);
  if (!ids.size) return response;

  const context = await requireFamilyContext(request, env);
  const allowedIds = new Set<string>();
  const values = Array.from(ids);
  for (let index = 0; index < values.length; index += 80) {
    const chunk = values.slice(index, index + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const files = await env.DB.prepare(`
      SELECT id FROM family_files
      WHERE familyId = ? AND deletedAt IS NULL AND id IN (${placeholders})
    `).bind(context.familyId, ...chunk).all<{ id: string }>();
    for (const file of files.results) allowedIds.add(file.id);
  }
  const urls = new Map<string, string>();
  await Promise.all(Array.from(allowedIds).map(async id => {
    urls.set(id, await createAbsoluteFileAccessUrl(request, env, id, context.familyId));
  }));
  const headers = new Headers(response.headers);
  return new Response(JSON.stringify(replaceFileReferences(data, null, urls)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function findFile(env: Env, context: FamilyContext, url: URL): Promise<Record<string, unknown>> {
  const id = url.searchParams.get('id');
  const objectKey = url.searchParams.get('key');
  if (!id && !objectKey) throw new ApiError(400, 'VALIDATION_ERROR', '缺少文件ID');
  const file = id
    ? await env.DB.prepare('SELECT * FROM family_files WHERE id = ? AND familyId = ? AND deletedAt IS NULL').bind(id, context.familyId).first<Record<string, unknown>>()
    : await env.DB.prepare('SELECT * FROM family_files WHERE objectKey = ? AND familyId = ? AND deletedAt IS NULL').bind(objectKey, context.familyId).first<Record<string, unknown>>();
  if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
  return file;
}

async function uploadFile(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  await checkRateLimit(env, `file-upload:${context.user.id}`, 30, 60 * 60 * 1000);
  const maxBytes = Math.min(20 * 1024 * 1024, Math.max(1024, Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024)));
  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > maxBytes + 64 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '文件过大');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', '请选择文件');
  if (file.size > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', `单个文件不能超过${Math.floor(maxBytes / 1024 / 1024)}MB`);
  if (!ALLOWED_TYPES.has(file.type)) throw new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', '不支持该文件类型');
  const quota = Math.max(maxBytes, Number(env.FAMILY_STORAGE_QUOTA_BYTES || 200 * 1024 * 1024));
  return withOperationLock(env, `family:${context.familyId}:storage`, async () => {
    const used = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM family_files WHERE familyId = ? AND deletedAt IS NULL')
      .bind(context.familyId).first<number>('used');
    if ((used || 0) + file.size > quota) throw new ApiError(413, 'FAMILY_STORAGE_QUOTA', '家庭文件空间已用完');
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const objectKey = `families/${context.familyId}/${Date.now()}/${crypto.randomUUID()}-${safeName}`;
    await env.FILE_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    const id = crypto.randomUUID();
    const now = Date.now();
    const purposeValue = form.get('purpose');
    const purpose = typeof purposeValue === 'string' ? purposeValue.slice(0, 40) : 'general';
    try {
      await env.DB.prepare(`
        INSERT INTO family_files (id, familyId, objectKey, name, contentType, size, purpose, uploadedBy, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, context.familyId, objectKey, file.name || safeName, file.type, file.size, purpose, context.user.id, now).run();
    } catch (error) {
      await env.FILE_BUCKET.delete(objectKey);
      throw error;
    }
    await writeAudit(env, context, 'file.uploaded', 'file', id, { size: file.size, purpose });
    const filePath = createStableFilePath(id);
    const accessUrl = await createAbsoluteFileAccessUrl(request, env, id, context.familyId);
    return json({
      id, name: file.name || safeName, contentType: file.type, size: file.size, purpose, createdAt: now,
      url: accessUrl, filePath,
    }, 201);
  });
}

async function fileInfo(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const file = await findFile(env, context, new URL(request.url));
  const id = String(file.id);
  return json({
    ...file,
    objectKey: undefined,
    filePath: createStableFilePath(id),
    url: await createAbsoluteFileAccessUrl(request, env, id, context.familyId),
  });
}

async function downloadFile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const expires = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('signature');
  let file: Record<string, unknown> | null = null;
  if (id && expires && provided) {
    file = await env.DB.prepare('SELECT * FROM family_files WHERE id = ? AND deletedAt IS NULL').bind(id).first<Record<string, unknown>>();
    if (!file || !await verifySignature(env, id, String(file.familyId), expires, provided)) {
      throw new ApiError(403, 'FILE_SIGNATURE_INVALID', '文件访问地址已失效');
    }
  } else {
    const context = await requireFamilyContext(request, env);
    file = await findFile(env, context, url);
  }
  const object = await env.FILE_BUCKET.get(String(file.objectKey));
  if (!object || !object.body) throw new ApiError(404, 'FILE_OBJECT_NOT_FOUND', '文件内容不存在');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', String(file.contentType));
  headers.set('Content-Length', String(file.size));
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(file.name))}`);
  return new Response(object.body, { headers });
}

async function listFiles(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const purpose = url.searchParams.get('purpose') || url.searchParams.get('type');
  const conditions = ['familyId = ?', 'deletedAt IS NULL'];
  const bindings: unknown[] = [context.familyId];
  if (purpose) { conditions.push('purpose = ?'); bindings.push(purpose); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM family_files WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT id, name, contentType, size, purpose, uploadedBy, createdAt
      FROM family_files WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  const list = await Promise.all((rows.results as Array<Record<string, unknown>>).map(async row => ({
    ...row,
    filePath: createStableFilePath(String(row.id)),
    url: await createAbsoluteFileAccessUrl(request, env, String(row.id), context.familyId),
  })));
  return json({ total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0), list, page, pageSize });
}

async function deleteOne(env: Env, context: FamilyContext, id: string): Promise<boolean> {
  const file = await env.DB.prepare('SELECT * FROM family_files WHERE id = ? AND familyId = ? AND deletedAt IS NULL')
    .bind(id, context.familyId).first<Record<string, unknown>>();
  if (!file) return false;
  if (file.uploadedBy !== context.user.id && !['owner', 'admin'].includes(context.role)) {
    throw new ApiError(403, 'FILE_DELETE_FORBIDDEN', '只能删除自己上传的文件');
  }
  await env.FILE_BUCKET.delete(String(file.objectKey));
  await env.DB.prepare('UPDATE family_files SET deletedAt = ? WHERE id = ? AND familyId = ?')
    .bind(Date.now(), id, context.familyId).run();
  return true;
}

async function deleteFile(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少文件ID');
  if (!await deleteOne(env, context, id)) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
  await writeAudit(env, context, 'file.deleted', 'file', id);
  return json({ success: true });
}

async function batchDelete(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<{ ids?: unknown; fileIds?: unknown }>(request);
  const value = body.ids ?? body.fileIds;
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', '文件列表无效');
  const ids = Array.from(new Set(value.filter((id): id is string => typeof id === 'string')));
  const deleted: string[] = [];
  for (const id of ids) if (await deleteOne(env, context, id)) deleted.push(id);
  await writeAudit(env, context, 'file.batch_deleted', 'file', undefined, { ids: deleted });
  return json({ success: true, deleted, notFound: ids.filter(id => !deleted.includes(id)) });
}

export async function handleFileV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'POST /api/file/upload': return uploadFile(request, env);
    case 'GET /api/file/info': return fileInfo(request, env);
    case 'GET /api/file/download': return downloadFile(request, env);
    case 'GET /api/file/list': return listFiles(request, env);
    case 'DELETE /api/file/delete': return deleteFile(request, env);
    case 'POST /api/file/batch-delete': return batchDelete(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
