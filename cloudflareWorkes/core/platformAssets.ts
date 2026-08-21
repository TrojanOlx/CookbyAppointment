import { ApiError } from './http';
import type { Env } from './types';

const encoder = new TextEncoder();

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

async function assetSignature(env: Env, fileId: string, expires: number): Promise<string> {
  const signed = await crypto.subtle.sign(
    'HMAC', await signingKey(env), encoder.encode(`platform-asset.${fileId}.${expires}`),
  );
  return bytesToBase64Url(new Uint8Array(signed));
}

async function verifyAssetSignature(env: Env, fileId: string, expires: number, provided: string): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 15 * 60 * 1000) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC', await signingKey(env), base64UrlToBytes(provided).buffer as ArrayBuffer,
      encoder.encode(`platform-asset.${fileId}.${expires}`),
    );
  } catch {
    return false;
  }
}

export function createStablePlatformAssetPath(fileId: string): string {
  return `/api/platform/template-assets/${encodeURIComponent(fileId)}`;
}

export function platformAssetIdFromUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://assets.internal');
    const match = url.pathname.match(/^\/api\/platform\/template-assets\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function createPlatformAssetUrl(
  request: Request,
  env: Env,
  fileId: string,
  ttlMs = 5 * 60 * 1000,
): Promise<string> {
  const expires = Date.now() + Math.min(10 * 60 * 1000, Math.max(30 * 1000, ttlMs));
  const signature = await assetSignature(env, fileId, expires);
  const path = `${createStablePlatformAssetPath(fileId)}?expires=${expires}&signature=${encodeURIComponent(signature)}`;
  return new URL(path, request.url).toString();
}

export async function resolvePlatformAssetUrls(
  request: Request,
  env: Env,
  values: string[],
): Promise<string[]> {
  const ids = Array.from(new Set(values.map(platformAssetIdFromUrl).filter((id): id is string => Boolean(id))));
  if (!ids.length) return values;
  const placeholders = ids.map(() => '?').join(',');
  const files = await env.DB.prepare(`
    SELECT id FROM platform_files WHERE deletedAt IS NULL AND id IN (${placeholders})
  `).bind(...ids).all<{ id: string }>();
  const urls = new Map<string, string>();
  await Promise.all(files.results.map(async file => {
    urls.set(file.id, await createPlatformAssetUrl(request, env, file.id));
  }));
  return values.map(value => {
    const id = platformAssetIdFromUrl(value);
    return id ? (urls.get(id) || '') : value;
  }).filter(Boolean);
}

export async function downloadPlatformAsset(request: Request, env: Env, fileId: string): Promise<Response> {
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('signature') || '';
  if (!provided || !await verifyAssetSignature(env, fileId, expires, provided)) {
    throw new ApiError(403, 'FILE_SIGNATURE_INVALID', '文件访问地址已失效');
  }
  const file = await env.DB.prepare(`
    SELECT * FROM platform_files WHERE id = ? AND deletedAt IS NULL
  `).bind(fileId).first<Record<string, unknown>>();
  if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
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
