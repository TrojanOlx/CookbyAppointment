import { checkRateLimit } from './auth';
import { ApiError } from './http';
import type { Env, FamilyContext } from './types';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const USER_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;
export const FAMILY_STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const DOCUMENT_TYPES = new Set(['application/pdf', 'text/plain']);
export const FAMILY_FILE_PURPOSES = new Set([
  'dishes', 'inventory', 'reviews', 'images', 'documents', 'files', 'default',
]);
export const PENDING_IMAGE_PURPOSES = new Set(['dishes', 'inventory', 'reviews']);

type ImageDimensions = { width: number; height: number };

function bytesEqual(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}

function uint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function imageDimensions(type: string, bytes: Uint8Array): ImageDimensions | null {
  if (type === 'image/png' && bytes.length >= 24 && bytesEqual(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/jpeg' && bytes.length >= 4 && bytesEqual(bytes, 0, [0xff, 0xd8, 0xff])) {
    return jpegDimensions(bytes);
  }
  if (type === 'image/webp' && bytes.length >= 30 && bytesEqual(bytes, 0, [82, 73, 70, 70]) && bytesEqual(bytes, 8, [87, 69, 66, 80])) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: uint24LE(bytes, 24) + 1, height: uint24LE(bytes, 27) + 1 };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
    if (chunk === 'VP8 ' && bytesEqual(bytes, 23, [0x9d, 0x01, 0x2a])) {
      return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    }
  }
  return null;
}

function extensionFor(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

export async function validateUploadFile(
  file: File,
  allowedTypes: ReadonlySet<string>,
  providedName?: string,
): Promise<{ safeName: string; width?: number; height?: number }> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'FILE_TOO_LARGE', '单个文件不能超过5MB', { max: MAX_UPLOAD_BYTES });
  }
  if (!allowedTypes.has(file.type)) throw new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', '不支持该文件类型');
  const safeName = (providedName || file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const extension = extensionFor(safeName);
  const expectedExtensions: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
    'application/pdf': ['pdf'], 'text/plain': ['txt'],
  };
  if (!extension || !expectedExtensions[file.type]?.includes(extension)) {
    throw new ApiError(415, 'FILE_CONTENT_INVALID', '文件扩展名与内容类型不一致');
  }
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer());
  if (IMAGE_TYPES.has(file.type)) {
    const dimensions = imageDimensions(file.type, bytes);
    if (!dimensions) throw new ApiError(415, 'FILE_CONTENT_INVALID', '图片内容与声明类型不一致');
    if (dimensions.width > 8192 || dimensions.height > 8192 || dimensions.width * dimensions.height > 25_000_000) {
      throw new ApiError(413, 'IMAGE_DIMENSIONS_TOO_LARGE', '图片尺寸过大', { maxDimension: 8192, maxPixels: 25_000_000 });
    }
    return { safeName, ...dimensions };
  }
  if (file.type === 'application/pdf' && !bytesEqual(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new ApiError(415, 'FILE_CONTENT_INVALID', 'PDF 文件内容无效');
  }
  if (file.type === 'text/plain' && bytes.includes(0)) {
    throw new ApiError(415, 'FILE_CONTENT_INVALID', '文本文件内容无效');
  }
  return { safeName };
}

export async function checkUploadRateLimits(env: Env, userId: string, scope = 'upload'): Promise<void> {
  await checkRateLimit(env, `${scope}:hour:${userId}`, 30, 60 * 60 * 1000);
  await checkRateLimit(env, `${scope}:day:${userId}`, 100, 24 * 60 * 60 * 1000);
}

export async function assertFamilyUploadQuota(env: Env, context: FamilyContext, incomingBytes: number): Promise<void> {
  const [familyUsed, userUsed] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM family_files WHERE familyId = ? AND deletedAt IS NULL').bind(context.familyId),
    env.DB.prepare(`
      SELECT COALESCE(SUM(size), 0) AS used FROM (
        SELECT size FROM family_files WHERE uploadedBy = ? AND deletedAt IS NULL
        UNION ALL
        SELECT size FROM user_files WHERE userId = ? AND deletedAt IS NULL
        UNION ALL
        SELECT size FROM platform_files WHERE uploadedBy = ? AND deletedAt IS NULL
      )
    `).bind(context.user.id, context.user.id, context.user.id),
  ]);
  const familyBytes = Number((familyUsed.results[0] as { used?: unknown } | undefined)?.used || 0);
  const userBytes = Number((userUsed.results[0] as { used?: unknown } | undefined)?.used || 0);
  if (userBytes + incomingBytes > USER_STORAGE_QUOTA_BYTES) {
    throw new ApiError(413, 'USER_STORAGE_QUOTA', '个人上传空间已用完', { max: USER_STORAGE_QUOTA_BYTES });
  }
  if (familyBytes + incomingBytes > FAMILY_STORAGE_QUOTA_BYTES) {
    throw new ApiError(413, 'FAMILY_STORAGE_QUOTA', '家庭文件空间已用完', { max: FAMILY_STORAGE_QUOTA_BYTES });
  }
}

export async function assertUserUploadQuota(env: Env, userId: string, incomingBytes: number): Promise<void> {
  const used = await env.DB.prepare(`
    SELECT COALESCE(SUM(size), 0) AS used FROM (
      SELECT size FROM family_files WHERE uploadedBy = ? AND deletedAt IS NULL
      UNION ALL
      SELECT size FROM user_files WHERE userId = ? AND deletedAt IS NULL
      UNION ALL
      SELECT size FROM platform_files WHERE uploadedBy = ? AND deletedAt IS NULL
    )
  `).bind(userId, userId, userId).first<number>('used');
  if (Number(used || 0) + incomingBytes > USER_STORAGE_QUOTA_BYTES) {
    throw new ApiError(413, 'USER_STORAGE_QUOTA', '个人上传空间已用完', { max: USER_STORAGE_QUOTA_BYTES });
  }
}

function familyFileId(value: string): string | null {
  try {
    const url = new URL(value, 'https://files.internal');
    return url.pathname === '/api/file/download' ? url.searchParams.get('id') : null;
  } catch {
    return null;
  }
}

export function familyFileIds(values: string[]): string[] {
  return Array.from(new Set(values.map(familyFileId).filter((id): id is string => Boolean(id))));
}

export async function claimFamilyImages(
  env: Env,
  context: FamilyContext,
  values: string[],
  targetType: 'dish' | 'inventory' | 'review',
  targetId: string,
  maxItems: number,
  retainedValues: string[] = [],
): Promise<string[]> {
  if (values.length > maxItems) throw new ApiError(400, 'VALIDATION_ERROR', `图片最多${maxItems}张`, { field: '图片', maxItems });
  const ids = familyFileIds(values);
  if (ids.length) {
    const unique = Array.from(new Set(ids));
    const retainedIds = new Set(familyFileIds(retainedValues));
    const placeholders = unique.map(() => '?').join(',');
    const files = await env.DB.prepare(`
      SELECT id, contentType, purpose, uploadedBy, targetType, targetId FROM family_files
      WHERE familyId = ? AND deletedAt IS NULL AND id IN (${placeholders})
    `).bind(context.familyId, ...unique).all<{
      id: string; contentType: string; purpose: string; uploadedBy: string;
      targetType: string | null; targetId: string | null;
    }>();
    if (files.results.length !== unique.length || files.results.some(file =>
      !IMAGE_TYPES.has(file.contentType)
      || (file.targetId && (file.targetId !== targetId || file.targetType !== targetType))
      || (!file.targetId
        && file.uploadedBy !== context.user.id
        && !(file.purpose === 'recipe-template-copy' && retainedIds.has(file.id)))
    )) {
      throw new ApiError(400, 'IMAGE_REFERENCE_INVALID', '图片不属于当前家庭或当前业务记录');
    }
    await env.DB.prepare(`
      UPDATE family_files SET targetType = ?, targetId = ?, attachedAt = ?, expiresAt = NULL
      WHERE familyId = ? AND targetType IS NULL AND targetId IS NULL
        AND deletedAt IS NULL AND id IN (${placeholders})
    `).bind(targetType, targetId, Date.now(), context.familyId, ...unique).run();
    const claimed = await env.DB.prepare(`
      SELECT id, targetType, targetId FROM family_files
      WHERE familyId = ? AND deletedAt IS NULL AND id IN (${placeholders})
    `).bind(context.familyId, ...unique).all<{ id: string; targetType: string | null; targetId: string | null }>();
    if (claimed.results.length !== unique.length || claimed.results.some(file =>
      file.targetType !== targetType || file.targetId !== targetId
    )) {
      throw new ApiError(409, 'IMAGE_ALREADY_ATTACHED', '图片已被其他业务记录使用，请重新选择');
    }
  }
  return values;
}

export async function expireDetachedTargetFiles(
  env: Env,
  familyId: string,
  targetType: 'dish' | 'inventory' | 'review',
  targetId: string,
  activeValues: string[],
): Promise<void> {
  const activeIds = familyFileIds(activeValues);
  const exclusion = activeIds.length ? ` AND id NOT IN (${activeIds.map(() => '?').join(',')})` : '';
  await env.DB.prepare(`
    UPDATE family_files SET expiresAt = ?
    WHERE familyId = ? AND targetType = ? AND targetId = ? AND deletedAt IS NULL${exclusion}
  `).bind(Date.now(), familyId, targetType, targetId, ...activeIds).run();
}

export async function expireTargetFiles(
  env: Env,
  familyId: string,
  targetType: 'dish' | 'inventory' | 'review',
  targetId: string,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE family_files SET expiresAt = ?
    WHERE familyId = ? AND targetType = ? AND targetId = ? AND deletedAt IS NULL
  `).bind(Date.now(), familyId, targetType, targetId).run();
}

export async function cleanupExpiredUploads(env: Env, limit = 100): Promise<number> {
  const expired = await env.DB.prepare(`
    SELECT id, objectKey FROM family_files
    WHERE deletedAt IS NULL AND expiresAt IS NOT NULL AND expiresAt <= ?
    ORDER BY expiresAt ASC LIMIT ?
  `).bind(Date.now(), limit).all<{ id: string; objectKey: string }>();
  for (const file of expired.results) {
    await env.FILE_BUCKET.delete(file.objectKey);
    await env.DB.prepare('UPDATE family_files SET deletedAt = ? WHERE id = ? AND deletedAt IS NULL')
      .bind(Date.now(), file.id).run();
  }
  return expired.results.length;
}
