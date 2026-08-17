import { parseJsonField } from './http';
import type { Env } from './types';

const TEMP_IMAGE_PATTERNS = [
  /^wxfile:\/\//i,
  /^https?:\/\/tmp(?:\/|$)/i,
  /^tmp_/i,
];

export function resolveImageReference(value: unknown, env: Env): string {
  if (typeof value !== 'string') return '';
  const image = value.trim();
  if (!image || image.includes('..') || TEMP_IMAGE_PATTERNS.some(pattern => pattern.test(image))) return '';

  if (image.startsWith('/api/file/download')) {
    try {
      const url = new URL(image, 'https://files.internal');
      return url.pathname === '/api/file/download' && url.searchParams.get('id')
        ? `${url.pathname}${url.search}`
        : '';
    } catch {
      return '';
    }
  }
  if (/^https?:\/\//i.test(image) || image.startsWith('/images/')) return image;

  const publicBase = String(env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  let objectKey = image.replace(/^\/+/, '');
  if (/^pages\/[^?#]+\/dishes\//i.test(objectKey)) {
    objectKey = objectKey.slice(objectKey.toLowerCase().indexOf('dishes/'));
  }
  return publicBase && objectKey ? `${publicBase}/${objectKey}` : '';
}

export function normalizeImageList(value: unknown, env: Env): string[] {
  const parsed = parseJsonField<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(image => resolveImageReference(image, env)).filter(Boolean);
}
