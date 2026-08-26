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

async function signature(env: Env, fileId: string, expires: number): Promise<string> {
  const signed = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`user-avatar.${fileId}.${expires}`));
  return bytesToBase64Url(new Uint8Array(signed));
}

async function verifySignature(env: Env, fileId: string, expires: number, provided: string): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 15 * 60 * 1000) return false;
  try {
    return crypto.subtle.verify(
      'HMAC', await signingKey(env), base64UrlToBytes(provided).buffer as ArrayBuffer,
      encoder.encode(`user-avatar.${fileId}.${expires}`),
    );
  } catch {
    return false;
  }
}

export function createStableUserAssetPath(fileId: string): string {
  return `/api/user/avatar/file?id=${encodeURIComponent(fileId)}`;
}

export function userAssetIdFromUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://user-assets.internal');
    return url.pathname === '/api/user/avatar/file' ? url.searchParams.get('id') : null;
  } catch {
    return null;
  }
}

export async function createUserAssetUrl(request: Request, env: Env, fileId: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const expires = Date.now() + Math.min(10 * 60 * 1000, Math.max(30 * 1000, ttlMs));
  const signed = await signature(env, fileId, expires);
  return new URL(`${createStableUserAssetPath(fileId)}&expires=${expires}&signature=${encodeURIComponent(signed)}`, request.url).toString();
}

export async function downloadUserAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const fileId = url.searchParams.get('id') || '';
  const expires = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('signature') || '';
  if (!fileId || !provided || !await verifySignature(env, fileId, expires, provided)) {
    throw new ApiError(403, 'FILE_SIGNATURE_INVALID', '头像访问地址已失效');
  }
  const file = await env.DB.prepare('SELECT * FROM user_files WHERE id = ? AND deletedAt IS NULL')
    .bind(fileId).first<Record<string, unknown>>();
  if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '头像不存在');
  const object = await env.FILE_BUCKET.get(String(file.objectKey));
  if (!object?.body) throw new ApiError(404, 'FILE_OBJECT_NOT_FOUND', '头像内容不存在');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', String(file.contentType));
  headers.set('Content-Length', String(file.size));
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(object.body, { headers });
}
