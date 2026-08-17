import { ApiError, errorResponse } from './core/http';
import type { Env } from './core/types';
import { handleAppointmentV2 } from './handlers/appointmentV2Handler';
import { handleDishV2 } from './handlers/dishV2Handler';
import { handleFamilyV2 } from './handlers/familyV2Handler';
import { decorateFamilyFileReferences, handleFileV2 } from './handlers/fileV2Handler';
import { handleInventoryV2 } from './handlers/inventoryV2Handler';
import { handlePreferenceV2 } from './handlers/preferenceV2Handler';
import { handleReviewV2 } from './handlers/reviewV2Handler';
import { handleShoppingV2 } from './handlers/shoppingV2Handler';
import { handleStatisticsV2 } from './handlers/statisticsV2Handler';
import { handleUserV2 } from './handlers/userV2Handler';

const FAMILY_PREFIXES = [
  '/api/family/', '/api/inventory/', '/api/dish/', '/api/appointment/',
  '/api/shopping/', '/api/review/', '/api/file/', '/api/admin/',
];

const USER_V2_PATHS = new Set([
  '/api/user/login', '/api/user/logout', '/api/user/info', '/api/user/admin',
  '/api/user/list', '/api/user/phone', '/api/user/avatar', '/api/user/export',
  '/api/user/account',
]);

function familyModeEnabled(env: Env): boolean {
  return !['off', 'false', '0'].includes(String(env.FAMILY_MODE || 'on').toLowerCase());
}

function versionParts(value: string): number[] {
  return value.split('.').map(part => Number.parseInt(part, 10) || 0).slice(0, 4);
}

function versionIsOlder(current: string, minimum: string): boolean {
  const left = versionParts(current);
  const right = versionParts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

function requireSupportedClient(request: Request, env: Env, path: string): void {
  if (!familyModeEnabled(env)) return;
  const minimum = env.MINIPROGRAM_MIN_VERSION?.trim();
  if (!minimum || path === '/api/user/login') return;
  if (path === '/api/file/download') {
    const url = new URL(request.url);
    if (url.searchParams.has('id') && url.searchParams.has('expires') && url.searchParams.has('signature')) return;
  }
  const current = request.headers.get('X-App-Version')?.trim() || '';
  if (!current || versionIsOlder(current, minimum)) {
    throw new ApiError(
      426,
      'CLIENT_UPDATE_REQUIRED',
      env.MINIPROGRAM_UPDATE_MESSAGE || '当前小程序版本过低，请更新后继续使用',
      { minimumVersion: minimum, currentVersion: current || null },
    );
  }
}

export function isV2Path(path: string, env: Env): boolean {
  if (path === '/api/user/profile' || path === '/api/user/phone/wx') return true;
  if (!familyModeEnabled(env)) return path.startsWith('/api/family/') || path === '/api/user/preferences';
  return USER_V2_PATHS.has(path) || path === '/api/user/preferences' || FAMILY_PREFIXES.some(prefix => path.startsWith(prefix));
}

export async function tryHandleV2(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!isV2Path(path, env)) return null;
  const requestId = request.headers.get('CF-Ray') || crypto.randomUUID();
  const startedAt = Date.now();
  try {
    requireSupportedClient(request, env, path);
    let response: Response;
    if (path.startsWith('/api/family/')) response = await handleFamilyV2(request, env, path);
    else if (path === '/api/user/preferences') response = await handlePreferenceV2(request, env);
    else if (path.startsWith('/api/user/')) response = await handleUserV2(request, env, path);
    else if (path.startsWith('/api/inventory/')) response = await handleInventoryV2(request, env, path);
    else if (path.startsWith('/api/dish/')) response = await handleDishV2(request, env, path);
    else if (path.startsWith('/api/appointment/') || path.startsWith('/api/admin/appointment/')) {
      response = await handleAppointmentV2(request, env, path);
    } else if (path.startsWith('/api/shopping/')) response = await handleShoppingV2(request, env, path);
    else if (path.startsWith('/api/review/') || path === '/api/admin/review/list') response = await handleReviewV2(request, env, path);
    else if (path === '/api/admin/statistics') response = await handleStatisticsV2(request, env);
    else if (path.startsWith('/api/file/')) response = await handleFileV2(request, env, path);
    else return null;
    if (FAMILY_PREFIXES.some(prefix => path.startsWith(prefix)) || path === '/api/user/list') {
      response = await decorateFamilyFileReferences(request, env, response);
    }
    console.log(JSON.stringify({
      message: 'request.complete', requestId, method: request.method, path,
      status: response.status, durationMs: Date.now() - startedAt,
    }));
    response.headers.set('X-Request-Id', requestId);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    console.error(JSON.stringify({
      message: 'request.failed', requestId, method: request.method, path,
      status: response.status, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }));
    response.headers.set('X-Request-Id', requestId);
    return response;
  }
}
