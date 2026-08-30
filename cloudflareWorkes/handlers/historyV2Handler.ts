import { requireAuth, requireFamilyContext } from '../core/auth';
import { ApiError, json, parseJsonField, readJson, requiredString } from '../core/http';
import { normalizeImageList } from '../core/media';
import {
  assertFamilyMemoryUploadQuota,
  assertFamilyUploadQuota,
  assertUserUploadQuota,
  checkUploadRateLimits,
  IMAGE_TYPES,
  PENDING_UPLOAD_TTL_MS,
  validateUploadFile,
} from '../core/uploadSecurity';
import { strictText, strictTextArray } from '../core/validation';
import {
  recalculateAchievements,
} from '../core/achievement';
import { normalizeDishName } from '../core/mealHistory';
import { userLifecycleLockScope, withOperationLock } from '../core/operationLock';
import type { AuthContext, Env, FamilyContext } from '../core/types';

const HISTORY_PAGE_SIZE = 20;
const MAX_NOTE_LENGTH = 500;
const MAX_DISHES = 30;

interface DishSnapshotInput {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  images?: unknown;
}

interface HistoryInput {
  id?: unknown;
  recordId?: unknown;
  date?: unknown;
  mealType?: unknown;
  scope?: unknown;
  familyId?: unknown;
  dishIds?: unknown;
  dishes?: unknown;
  images?: unknown;
  note?: unknown;
  confirmDuplicate?: unknown;
}

interface LocalFamilyContext extends FamilyContext {
  familyId: string;
}

interface DishSnapshot {
  originalDishId: string | null;
  normalizedName: string;
  nameSnapshot: string;
  typeSnapshot: string;
  imagesSnapshot: string;
  sortOrder: number;
}

interface FileRow {
  id: string;
  objectKey: string;
  ownerUserId: string | null;
  mealRecordId: string | null;
  participantId: string | null;
  participantUserId: string | null;
  familyId: string | null;
  name: string;
  contentType: string;
  size: number;
  createdAt: number;
  attachedAt: number | null;
  expiresAt: number | null;
  frozenAt: number | null;
  deletedAt: number | null;
}

function withHistoryMutationLocks<T>(
  env: Env,
  auth: AuthContext,
  familyId: string | null,
  needsFamilyStorage: boolean,
  execute: () => Promise<T>,
): Promise<T> {
  const userId = auth.user.id;
  return withOperationLock(env, userLifecycleLockScope(userId), async () => {
    const activeSession = await env.DB.prepare(`
      SELECT 1 FROM user_sessions
      WHERE id = ? AND userId = ? AND revokedAt IS NULL AND expiresAt > ?
    `).bind(auth.sessionId, userId, Date.now()).first();
    if (!activeSession) throw new ApiError(401, 'SESSION_INVALID', '登录已过期，请重新登录');
    return withOperationLock(env, `user:${userId}:upload-storage`, () => {
      if (!familyId) return execute();
      return withOperationLock(env, `family:${familyId}:membership`, () => (
        needsFamilyStorage
          ? withOperationLock(env, `family:${familyId}:storage`, execute)
          : execute()
      ));
    });
  });
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseDate(value: unknown, required = true): string {
  const date = strictText(value, '日期', 10, { required });
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'VALIDATION_ERROR', '日期格式应为YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ApiError(400, 'VALIDATION_ERROR', '日期无效');
  }
  return date;
}

function parseMealType(value: unknown, required = true): string {
  return strictText(value, '餐次', 20, { required });
}

function uniqueStrings(value: unknown, field: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'VALIDATION_ERROR', `${field}必须是数组`);
  const values = value.map(item => requiredString(item, field, 200));
  const unique = Array.from(new Set(values));
  if (unique.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${field}最多${max}项`);
  return unique;
}

function extractFileIds(value: unknown): string[] {
  const values = uniqueStrings(value, '回忆图片', 3);
  return values.map(item => {
    try {
      const url = new URL(item, 'https://history-files.internal');
      if (url.pathname === '/api/history/file/download' && url.searchParams.get('id')) {
        return url.searchParams.get('id') || '';
      }
    } catch {
      // Treat the value as a raw upload ID below.
    }
    if (!/^[A-Za-z0-9:_-]{1,160}$/.test(item)) {
      throw new ApiError(400, 'IMAGE_REFERENCE_INVALID', '回忆图片引用无效');
    }
    return item;
  });
}

async function familyContextForId(auth: AuthContext, env: Env, familyId: string): Promise<LocalFamilyContext> {
  const membership = await env.DB.prepare(`
    SELECT fm.role, f.name AS familyName, f.timezone
    FROM family_members fm JOIN families f ON f.id = fm.familyId
    WHERE fm.familyId = ? AND fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
  `).bind(familyId, auth.user.id).first<{ role: LocalFamilyContext['role']; familyName: string; timezone: string }>();
  if (!membership) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '无权访问该家庭');
  return { ...auth, familyId, ...membership };
}

async function writeHistoryAudit(
  env: Env,
  auth: AuthContext,
  familyId: string | null,
  action: string,
  targetId: string,
  details?: unknown,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
    VALUES (?, ?, ?, ?, 'meal_record', ?, ?, ?)
  `).bind(
    crypto.randomUUID(), familyId, auth.user.id, action, targetId,
    details === undefined ? null : JSON.stringify(details), Date.now(),
  ).run();
}

async function selectedFamilyContext(request: Request, env: Env, familyIdValue: unknown): Promise<LocalFamilyContext> {
  const requested = familyIdValue === undefined || familyIdValue === null || familyIdValue === ''
    ? '' : strictText(familyIdValue, '家庭ID', 100);
  const auth = await requireAuth(request, env);
  const familyId = requested || request.headers.get('X-Family-Id')?.trim() || '';
  if (!familyId) {
    const context = await requireFamilyContext(request, env);
    return context;
  }
  return familyContextForId(auth, env, familyId);
}

function parseDishInput(body: HistoryInput): DishSnapshotInput[] {
  const values: unknown[] = [];
  if (body.dishIds !== undefined) {
    if (!Array.isArray(body.dishIds)) throw new ApiError(400, 'VALIDATION_ERROR', '菜品ID必须是数组');
    values.push(...body.dishIds);
  }
  if (body.dishes !== undefined) {
    if (!Array.isArray(body.dishes)) throw new ApiError(400, 'VALIDATION_ERROR', '菜品必须是数组');
    values.push(...body.dishes);
  }
  if (values.length === 0 || values.length > MAX_DISHES) {
    throw new ApiError(400, 'VALIDATION_ERROR', `菜品数量应为1到${MAX_DISHES}道`);
  }
  return values.map(value => {
    if (typeof value === 'string') return { id: value };
    if (!value || typeof value !== 'object') throw new ApiError(400, 'VALIDATION_ERROR', '菜品项无效');
    const item = value as Record<string, unknown>;
    return { id: item.id, name: item.name, type: item.type, images: item.images };
  });
}

async function buildDishSnapshots(
  env: Env,
  context: LocalFamilyContext | null,
  body: HistoryInput,
): Promise<DishSnapshot[]> {
  const input = parseDishInput(body);
  const ids = Array.from(new Set(input
    .map(item => typeof item.id === 'string' ? item.id.trim() : '')
    .filter(Boolean)));
  const existing = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    if (!context) throw new ApiError(400, 'FAMILY_REQUIRED_FOR_DISH', '选择已有菜品时请先选择家庭');
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, name, type, images FROM dishes
      WHERE familyId = ? AND id IN (${placeholders})
    `).bind(context.familyId, ...ids).all<Record<string, unknown>>();
    for (const row of rows.results) existing.set(String(row.id), row);
    if (existing.size !== ids.length) throw new ApiError(400, 'DISH_ACCESS_DENIED', '部分菜品不存在或无权访问');
  }
  const snapshots: DishSnapshot[] = [];
  const seen = new Set<string>();
  for (const [index, item] of input.entries()) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const row = id ? existing.get(id) : null;
    if (id && !row) throw new ApiError(400, 'DISH_ACCESS_DENIED', '菜品不存在或无权访问');
    const name = row
      ? strictText(row.name, '菜名', 80, { required: true, meaningfulName: true })
      : strictText(item.name, '菜名', 80, { required: true, meaningfulName: true });
    const key = normalizeDishName(name);
    if (!key || seen.has(`${id}\u0000${key}`)) continue;
    seen.add(`${id}\u0000${key}`);
    const images = row
      ? normalizeImageList(row.images, env)
      : strictTextArray(item.images ?? [], '菜品图片', 3, 1000);
    snapshots.push({
      originalDishId: row ? String(row.id) : null,
      normalizedName: key,
      nameSnapshot: name,
      typeSnapshot: row ? strictText(row.type, '菜品类型', 20) : strictText(item.type, '菜品类型', 20),
      imagesSnapshot: JSON.stringify(images),
      sortOrder: index,
    });
  }
  if (!snapshots.length) throw new ApiError(400, 'VALIDATION_ERROR', '请至少填写一道有效菜品');
  return snapshots.map((snapshot, index) => ({ ...snapshot, sortOrder: index }));
}

async function participantSnapshots(env: Env, userIds: string[]): Promise<Array<{ userId: string; name: string; avatar: string; badge: string }>> {
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT u.id AS userId, COALESCE(u.nickName, '') AS name, COALESCE(u.avatarUrl, '') AS avatar,
      uas.pinnedAchievementId
    FROM users u LEFT JOIN user_achievement_state uas ON uas.userId = u.id
    WHERE u.id IN (${placeholders})
  `).bind(...userIds).all<{ userId: string; name: string; avatar: string; pinnedAchievementId: string | null }>();
  const byId = new Map(rows.results.map(row => [row.userId, row]));
  return userIds.map(userId => {
    const row = byId.get(userId);
    return {
      userId,
      name: row?.name || '',
      avatar: row?.avatar || '',
      badge: row?.pinnedAchievementId ? JSON.stringify([row.pinnedAchievementId]) : '[]',
    };
  });
}

export async function validatePendingFiles(
  env: Env,
  userId: string,
  fileIds: string[],
  recordId: string,
  participantId: string,
  familyId: string | null,
  at: number,
): Promise<{ rows: FileRow[]; statements: D1PreparedStatement[]; guard: D1PreparedStatement | null }> {
  if (!fileIds.length) return { rows: [], statements: [], guard: null };
  const placeholders = fileIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, objectKey, ownerUserId, mealRecordId, participantId, participantUserId,
      familyId, name, contentType, size, createdAt, attachedAt, expiresAt, frozenAt, deletedAt
    FROM meal_memory_files
    WHERE id IN (${placeholders}) AND deletedAt IS NULL
  `).bind(...fileIds).all<FileRow>();
  if (rows.results.length !== fileIds.length || rows.results.some(row =>
    row.ownerUserId !== userId || !IMAGE_TYPES.has(row.contentType)
      || (row.mealRecordId !== null && (row.mealRecordId !== recordId || row.participantId !== participantId))
      || (row.familyId !== null && row.familyId !== familyId)
      || (row.expiresAt !== null && row.expiresAt !== undefined && row.expiresAt <= at)
      || (row.frozenAt !== null && row.frozenAt !== undefined)
  )) {
    throw new ApiError(400, 'IMAGE_REFERENCE_INVALID', '图片不属于当前用户、已过期或已被其他记录使用');
  }
  if (familyId) {
    const incomingBytes = rows.results.reduce((total, row) => (
      row.familyId === familyId ? total : total + Number(row.size || 0)
    ), 0);
    await assertFamilyMemoryUploadQuota(env, familyId, incomingBytes);
  }
  const statements = rows.results.map(row => env.DB.prepare(`
    UPDATE meal_memory_files
    SET mealRecordId = ?, participantId = ?, participantUserId = ?, familyId = ?,
      attachedAt = ?, expiresAt = NULL
    WHERE id = ? AND ownerUserId = ? AND deletedAt IS NULL
      AND (mealRecordId IS NULL OR (mealRecordId = ? AND participantId = ?))
      AND (expiresAt IS NULL OR expiresAt > ?)
      AND (familyId IS NULL OR familyId = ?)
      AND frozenAt IS NULL
      AND EXISTS (
        SELECT 1 FROM meal_record_participants p
        JOIN meal_records mr ON mr.id = p.mealRecordId
        WHERE p.id = ? AND p.mealRecordId = ? AND p.userId = ?
          AND p.frozenAt IS NULL AND mr.frozenAt IS NULL AND mr.deletedAt IS NULL
      )
  `).bind(
    recordId, participantId, userId, familyId, at,
    row.id, userId, recordId, participantId, at, familyId,
    participantId, recordId, userId,
  ));
  // The NOT NULL violation rolls the surrounding D1 batch back if any
  // conditional file binding lost a race after the validation query.
  const guard = env.DB.prepare(`
    UPDATE meal_record_participants SET note = NULL
    WHERE id = ? AND mealRecordId = ? AND userId = ?
      AND (
        SELECT COUNT(*) FROM meal_memory_files
        WHERE id IN (${fileIds.map(() => '?').join(',')})
          AND ownerUserId = ? AND mealRecordId = ? AND participantId = ?
          AND participantUserId = ? AND deletedAt IS NULL AND frozenAt IS NULL
          AND (familyId = ? OR (familyId IS NULL AND ? IS NULL))
      ) <> ?
  `).bind(
    participantId, recordId, userId,
    ...fileIds, userId, recordId, participantId, userId, familyId, familyId, fileIds.length,
  );
  return { rows: rows.results, statements, guard };
}

function fileIdsFromRows(rows: FileRow[]): string[] {
  return rows.filter(row => row.deletedAt === null).map(row => row.id);
}

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

async function historySignature(env: Env, fileId: string, expires: number): Promise<string> {
  const signed = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`meal-memory.${fileId}.${expires}`));
  return bytesToBase64Url(new Uint8Array(signed));
}

async function verifyHistorySignature(env: Env, fileId: string, expires: number, provided: string): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 15 * 60 * 1000) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC', await signingKey(env), base64UrlToBytes(provided).buffer as ArrayBuffer,
      encoder.encode(`meal-memory.${fileId}.${expires}`),
    );
  } catch {
    return false;
  }
}

export async function createHistoryFileAccessUrl(request: Request, env: Env, fileId: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const expires = Date.now() + Math.min(10 * 60 * 1000, Math.max(30 * 1000, ttlMs));
  const signature = await historySignature(env, fileId, expires);
  return new URL(`/api/history/file/download?id=${encodeURIComponent(fileId)}&expires=${expires}&signature=${encodeURIComponent(signature)}`, request.url).toString();
}

async function filesForRecord(env: Env, recordId: string): Promise<FileRow[]> {
  const rows = await env.DB.prepare(`
    SELECT id, objectKey, ownerUserId, mealRecordId, participantId, participantUserId,
      familyId, name, contentType, size, createdAt, attachedAt, frozenAt, deletedAt
    FROM meal_memory_files WHERE mealRecordId = ? AND deletedAt IS NULL ORDER BY createdAt ASC
  `).bind(recordId).all<FileRow>();
  return rows.results;
}

async function decorateFiles(request: Request, env: Env, rows: FileRow[]): Promise<Array<Record<string, unknown>>> {
  return Promise.all(rows.map(async row => ({
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt,
    url: await createHistoryFileAccessUrl(request, env, row.id),
  })));
}

async function recordDishes(env: Env, recordIds: string[]): Promise<Map<string, Array<Record<string, unknown>>>> {
  const result = new Map<string, Array<Record<string, unknown>>>();
  if (!recordIds.length) return result;
  const placeholders = recordIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, mealRecordId, originalDishId, normalizedName, nameSnapshot, typeSnapshot, imagesSnapshot, sortOrder
    FROM meal_record_dishes WHERE mealRecordId IN (${placeholders}) ORDER BY mealRecordId, sortOrder
  `).bind(...recordIds).all<Record<string, unknown>>();
  for (const row of rows.results) {
    const list = result.get(String(row.mealRecordId)) || [];
    list.push({
      id: row.id,
      originalDishId: row.originalDishId,
      normalizedName: row.normalizedName,
      name: row.nameSnapshot,
      type: row.typeSnapshot,
      images: normalizeImageList(row.imagesSnapshot, env),
      sortOrder: row.sortOrder,
    });
    result.set(String(row.mealRecordId), list);
  }
  return result;
}

async function recordParticipants(env: Env, recordIds: string[]): Promise<Map<string, Array<Record<string, unknown>>>> {
  const result = new Map<string, Array<Record<string, unknown>>>();
  if (!recordIds.length) return result;
  const placeholders = recordIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot,
      personalHiddenAt, note, frozenAt, badgeSnapshot, legacyFallback, updatedAt
    FROM meal_record_participants WHERE mealRecordId IN (${placeholders}) ORDER BY mealRecordId, createdAt
  `).bind(...recordIds).all<Record<string, unknown>>();
  for (const row of rows.results) {
    const list = result.get(String(row.mealRecordId)) || [];
    list.push({
      id: row.id,
      userId: row.userId,
      name: row.userNameSnapshot,
      nickName: row.userNameSnapshot,
      avatar: row.userAvatarSnapshot,
      avatarUrl: row.userAvatarSnapshot,
      note: row.note,
      frozenAt: row.frozenAt,
      frozen: Boolean(row.frozenAt),
      badgeIds: parseJsonField(row.badgeSnapshot, []),
      badge: parseJsonField(row.badgeSnapshot, []),
      legacyFallback: Boolean(row.legacyFallback),
      updatedAt: row.updatedAt,
    });
    result.set(String(row.mealRecordId), list);
  }
  return result;
}

async function decorateRecordList(
  request: Request,
  env: Env,
  records: Array<Record<string, unknown>>,
  viewerId: string,
  familyView: boolean,
): Promise<Array<Record<string, unknown>>> {
  const ids = records.map(record => String(record.id));
  const [dishes, participants, files] = await Promise.all([
    recordDishes(env, ids),
    recordParticipants(env, ids),
    Promise.all(ids.map(id => filesForRecord(env, id))),
  ]);
  return Promise.all(records.map(async (record, index) => {
    const recordId = String(record.id);
    const fileRows = files[index] || [];
    const participantRows = participants.get(recordId) || [];
    const viewer = participantRows.find(row => row.userId === viewerId);
    const repeatability = await repeatabilityForDishes(env, record, dishes.get(recordId) || [], viewerId);
    const publicSource = record.source === 'appointment'
      ? (record.legacyBackfilled ? 'legacy_backfill' : 'automatic')
      : 'manual';
    const previews = fileRows.slice(0, 3);
    return {
      ...record,
      source: publicSource,
      scope: record.scope,
      sourceLabel: publicSource === 'legacy_backfill'
        ? '历史回填' : publicSource === 'automatic'
        ? '自动记录'
        : '手动补记',
      familyName: record.familyNameSnapshot || (record.scope === 'personal' ? '仅自己' : ''),
      dishes: repeatability.dishes,
      repeatDishIds: repeatability.repeatDishIds,
      repeatUnavailableNames: repeatability.repeatUnavailableNames,
      repeatFamilyId: repeatability.repeatFamilyId,
      participants: familyView ? participantRows : viewer ? [viewer] : [],
      participantCount: participantRows.length,
      memoryCount: fileRows.length,
      previewImages: await Promise.all(previews.map(file => createHistoryFileAccessUrl(request, env, file.id))),
      firstImage: previews[0] ? await createHistoryFileAccessUrl(request, env, previews[0].id) : '',
      canEdit: record.source === 'manual' && record.ownerUserId === viewerId
        && Boolean(viewer) && !viewer?.frozenAt && !record.frozenAt && !record.deletedAt,
      canContribute: Boolean(viewer && !viewer.frozenAt && !record.frozenAt && !record.deletedAt),
    };
  }));
}

async function listHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const view = url.searchParams.get('view') || url.searchParams.get('scope') || 'personal';
  if (view !== 'personal' && view !== 'family') throw new ApiError(400, 'VALIDATION_ERROR', '历史视图无效');
  const auth = await requireAuth(request, env);
  let context: LocalFamilyContext | null = null;
  if (view === 'family') context = await requireFamilyContext(request, env);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  const baseConditions: string[] = ['mr.deletedAt IS NULL'];
  const baseBindings: unknown[] = [];
  if (view === 'family') {
    baseConditions.push("mr.scope = 'family'", 'mr.familyId = ?');
    baseBindings.push(context?.familyId);
  } else {
    baseConditions.push('p.userId = ?', 'p.personalHiddenAt IS NULL');
    baseBindings.push(auth.user.id);
  }
  const filterConditions = [...baseConditions];
  const filterBindings = [...baseBindings];
  const familyId = url.searchParams.get('familyId');
  if (view === 'personal' && familyId) {
    filterConditions.push('mr.familyId = ?');
    filterBindings.push(strictText(familyId, '家庭ID', 100));
  }
  const search = url.searchParams.get('search') || url.searchParams.get('q');
  if (search) {
    const term = strictText(search, '菜名搜索', 80);
    filterConditions.push(`EXISTS (
      SELECT 1 FROM meal_record_dishes searchDish
      WHERE searchDish.mealRecordId = mr.id AND searchDish.nameSnapshot LIKE ?
    )`);
    filterBindings.push(`%${term}%`);
  }
  const year = url.searchParams.get('year');
  if (year) {
    if (!/^\d{4}$/.test(year)) throw new ApiError(400, 'VALIDATION_ERROR', '年份无效');
    filterConditions.push('mr.date LIKE ?'); filterBindings.push(`${year}-%`);
  }
  const mealType = url.searchParams.get('mealType');
  if (mealType) { filterConditions.push('mr.mealType = ?'); filterBindings.push(strictText(mealType, '餐次', 20)); }
  const source = url.searchParams.get('source');
  if (source) {
    if (!['automatic', 'legacy_backfill', 'manual', 'appointment'].includes(source)) throw new ApiError(400, 'VALIDATION_ERROR', '记录来源无效');
    if (source === 'legacy_backfill') filterConditions.push("mr.source = 'appointment'", 'mr.legacyBackfilled = 1');
    else if (source === 'automatic') filterConditions.push("mr.source = 'appointment'", 'mr.legacyBackfilled = 0');
    else filterConditions.push('mr.source = ?');
    if (source === 'manual' || source === 'appointment') filterBindings.push(source === 'appointment' ? 'appointment' : source);
  }
  const where = filterConditions.join(' AND ');
  const baseWhere = baseConditions.join(' AND ');
  const [count, rows, filterRows] = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) AS total FROM meal_records mr
      ${view === 'personal' ? 'JOIN meal_record_participants p ON p.mealRecordId = mr.id' : ''}
      WHERE ${where}
    `).bind(...filterBindings),
    env.DB.prepare(`
      SELECT mr.* FROM meal_records mr
      ${view === 'personal' ? 'JOIN meal_record_participants p ON p.mealRecordId = mr.id' : ''}
      WHERE ${where}
      ORDER BY mr.date DESC, COALESCE(mr.completedAt, mr.createdAt) DESC, mr.id DESC
      LIMIT ? OFFSET ?
    `).bind(...filterBindings, HISTORY_PAGE_SIZE, offset),
    env.DB.prepare(`
      SELECT DISTINCT mr.familyId, mr.familyNameSnapshot, mr.date, mr.mealType,
        mr.source, mr.legacyBackfilled
      FROM meal_records mr
      ${view === 'personal' ? 'JOIN meal_record_participants p ON p.mealRecordId = mr.id' : ''}
      WHERE ${baseWhere}
      ORDER BY mr.date DESC
    `).bind(...baseBindings),
  ]);
  const records = await decorateRecordList(
    request,
    env,
    rows.results as Array<Record<string, unknown>>,
    auth.user.id,
    view === 'family',
  );
  const total = Number((count.results[0] as { total?: unknown } | undefined)?.total || 0);
  const filterValues = filterRows.results as Array<Record<string, unknown>>;
  const families = Array.from(new Map(filterValues
    .filter(row => row.familyId)
    .map(row => [textValue(row.familyId), { id: textValue(row.familyId), name: textValue(row.familyNameSnapshot) }])).values());
  const years = Array.from(new Set(filterValues
    .map(row => textValue(row.date).slice(0, 4))
    .filter(value => /^\d{4}$/.test(value)))).sort((left, right) => right.localeCompare(left));
  const mealTypes = Array.from(new Set(filterValues.map(row => textValue(row.mealType)).filter(Boolean)));
  const sources = Array.from(new Set(filterValues.map(row => row.source === 'manual'
    ? 'manual' : row.legacyBackfilled ? 'legacy_backfill' : 'automatic')));
  return json({
    total,
    list: records,
    page,
    pageSize: HISTORY_PAGE_SIZE,
    hasMore: offset + records.length < total,
    view,
    filters: { families, years, mealTypes, sources },
  });
}

async function findRecord(env: Env, id: string): Promise<Record<string, unknown>> {
  const record = await env.DB.prepare('SELECT * FROM meal_records WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!record) throw new ApiError(404, 'HISTORY_NOT_FOUND', '餐桌回忆不存在');
  return record;
}

async function canViewRecord(env: Env, record: Record<string, unknown>, userId: string): Promise<boolean> {
  const own = await env.DB.prepare(`
    SELECT 1 FROM meal_record_participants
    WHERE mealRecordId = ? AND userId = ? LIMIT 1
  `).bind(record.id, userId).first();
  if (own) return true;
  if (record.scope !== 'family' || !record.familyId) return false;
  const context = await familyContextForId({
    sessionId: '',
    user: { id: userId, openid: '', nickName: null, avatarUrl: null, phoneNumber: null, status: 'active' },
  }, env, textValue(record.familyId)).catch(() => null);
  return Boolean(context);
}

async function repeatabilityForDishes(
  env: Env,
  record: Record<string, unknown>,
  inputDishes: Array<Record<string, unknown>>,
  viewerId: string,
): Promise<{
  dishes: Array<Record<string, unknown>>;
  repeatDishIds: string[];
  repeatUnavailableNames: string[];
  repeatFamilyId: string | null;
}> {
  const familyId = textValue(record.familyId);
  let hasFamilyAccess = false;
  if (familyId) {
    const membership = await env.DB.prepare(`
      SELECT 1 FROM family_members fm JOIN families f ON f.id = fm.familyId
      WHERE fm.familyId = ? AND fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
    `).bind(familyId, viewerId).first();
    hasFamilyAccess = Boolean(membership);
  }
  const originalIds = inputDishes
    .map(dish => typeof dish.originalDishId === 'string' ? dish.originalDishId : '')
    .filter(Boolean);
  const availableIds = new Set<string>();
  if (hasFamilyAccess && originalIds.length) {
    const placeholders = originalIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id FROM dishes WHERE familyId = ? AND id IN (${placeholders})
    `).bind(familyId, ...Array.from(new Set(originalIds))).all<{ id: string }>();
    for (const row of rows.results) availableIds.add(row.id);
  }
  const repeatDishIds = Array.from(new Set(originalIds.filter(id => availableIds.has(id))));
  const repeatUnavailableNames = Array.from(new Set(inputDishes
    .filter(dish => !availableIds.has(textValue(dish.originalDishId)))
    .map(dish => textValue(dish.name))
    .filter(Boolean)));
  return {
    dishes: inputDishes.map(dish => {
      const id = typeof dish.originalDishId === 'string' ? dish.originalDishId : '';
      const repeatable = Boolean(id && availableIds.has(id));
      return { ...dish, available: repeatable, repeatable };
    }),
    repeatDishIds,
    repeatUnavailableNames,
    repeatFamilyId: familyId || null,
  };
}

async function detailHistory(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const id = requiredString(new URL(request.url).searchParams.get('id'), '历史记录ID');
  const record = await findRecord(env, id);
  if (record.deletedAt) throw new ApiError(404, 'HISTORY_NOT_FOUND', '餐桌回忆不存在');
  if (!await canViewRecord(env, record, auth.user.id)) throw new ApiError(403, 'HISTORY_ACCESS_DENIED', '无权查看该餐桌回忆');
  const [dishes, participants, fileRows] = await Promise.all([
    recordDishes(env, [id]),
    recordParticipants(env, [id]),
    filesForRecord(env, id),
  ]);
  const viewerParticipant = await env.DB.prepare(`
    SELECT personalHiddenAt, frozenAt
    FROM meal_record_participants
    WHERE mealRecordId = ? AND userId = ?
    LIMIT 1
  `).bind(id, auth.user.id).first<{ personalHiddenAt: number | null; frozenAt: number | null }>();
  const participantList = participants.get(id) || [];
  const files = await decorateFiles(request, env, fileRows);
  const participantsWithImages = participantList.map(participant => {
    const participantFileRows = fileRows
      .filter(file => file.participantId === participant.id || (file.participantId === null && file.participantUserId === participant.userId));
    const participantFiles = participantFileRows
      .map(file => files.find(item => item.id === file.id))
      .filter((file): file is Record<string, unknown> => Boolean(file));
    return {
      ...participant,
      images: participantFiles.map(file => textValue(file.url)),
      imageRefs: participantFileRows.map(file => file.id),
      files: participantFiles,
      canEdit: participant.userId === auth.user.id && !participant.frozenAt && !record.frozenAt,
    };
  });
  const repeatability = await repeatabilityForDishes(env, record, dishes.get(id) || [], auth.user.id);
  const publicSource = record.source === 'appointment'
    ? (record.legacyBackfilled ? 'legacy_backfill' : 'automatic')
    : 'manual';
  return json({
    ...record,
    source: publicSource,
    sourceLabel: publicSource === 'legacy_backfill' ? '历史回填' : publicSource === 'automatic' ? '自动记录' : '手动补记',
    familyName: record.familyNameSnapshot || (record.scope === 'personal' ? '仅自己' : ''),
    participantCount: participantsWithImages.length,
    previewImages: await Promise.all(fileRows.slice(0, 3).map(file => createHistoryFileAccessUrl(request, env, file.id))),
    firstImage: fileRows[0] ? await createHistoryFileAccessUrl(request, env, fileRows[0].id) : '',
    dishes: repeatability.dishes,
    participants: participantsWithImages,
    contributions: participantsWithImages,
    repeatDishIds: repeatability.repeatDishIds,
    repeatUnavailableNames: repeatability.repeatUnavailableNames,
    repeatFamilyId: repeatability.repeatFamilyId,
    canEdit: record.source === 'manual' && record.ownerUserId === auth.user.id
      && Boolean(viewerParticipant) && viewerParticipant?.frozenAt == null && !record.frozenAt,
    canDelete: record.source === 'manual' && record.ownerUserId === auth.user.id
      && Boolean(viewerParticipant) && viewerParticipant?.frozenAt == null && !record.frozenAt,
    canExclude: record.source === 'appointment'
      && Boolean(viewerParticipant)
      && viewerParticipant?.personalHiddenAt == null
      && viewerParticipant?.frozenAt == null,
  });
}

async function duplicateCandidates(env: Env, ownerUserId: string, scopeKey: string, date: string, mealType: string): Promise<unknown[]> {
  const rows = await env.DB.prepare(`
    SELECT id, date, mealType, source, familyNameSnapshot, createdAt
    FROM meal_records
    WHERE scopeKey = ? AND date = ? AND mealType = ? AND deletedAt IS NULL
      AND EXISTS (
        SELECT 1 FROM meal_record_participants p
        WHERE p.mealRecordId = meal_records.id AND p.userId = ?
      )
    ORDER BY createdAt DESC LIMIT 10
  `).bind(scopeKey, date, mealType, ownerUserId).all();
  return rows.results;
}

async function createHistory(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<HistoryInput>(request);
  const requestedScope = body.scope === undefined ? (body.familyId ? 'family' : 'personal') : strictText(body.scope, '记录范围', 20);
  if (requestedScope !== 'family' && requestedScope !== 'personal') throw new ApiError(400, 'VALIDATION_ERROR', '记录范围无效');
  const date = parseDate(body.date);
  const mealType = parseMealType(body.mealType);
  const fileIds = extractFileIds(body.images);
  const initialContext = requestedScope === 'family'
    ? await selectedFamilyContext(request, env, body.familyId)
    : null;
  const familyId = initialContext?.familyId || null;
  return withHistoryMutationLocks(env, auth, familyId, Boolean(familyId && fileIds.length), async () => {
    const context = familyId ? await familyContextForId(auth, env, familyId) : null;
    const scopeKey = context ? `family:${context.familyId}` : `personal:${auth.user.id}`;
    const duplicate = await duplicateCandidates(env, auth.user.id, scopeKey, date, mealType);
    if (duplicate.length && body.confirmDuplicate !== true) {
      throw new ApiError(409, 'HISTORY_DUPLICATE_CONFIRM_REQUIRED', '发现可能重复的餐桌回忆，请确认后继续', { candidates: duplicate });
    }
    const dishes = await buildDishSnapshots(env, context, body);
    const participantSnapshotRows = await participantSnapshots(env, [auth.user.id]);
    const id = crypto.randomUUID();
    const at = Date.now();
    const participantIdByUser = new Map<string, string>();
    const participantRows = participantSnapshotRows.map(snapshot => {
      const participantId = crypto.randomUUID();
      participantIdByUser.set(snapshot.userId, participantId);
      return { ...snapshot, id: participantId };
    });
    const firstParticipantId = participantIdByUser.get(auth.user.id) || participantRows[0]?.id;
    if (!firstParticipantId) throw new ApiError(400, 'PARTICIPANT_REQUIRED', '至少需要一位参与成员');
    const files = await validatePendingFiles(env, auth.user.id, fileIds, id, firstParticipantId, familyId, at);
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`
        INSERT INTO meal_records (
          id, source, scope, scopeKey, familyId, familyNameSnapshot, date, mealType,
          completedAt, ownerUserId, createdBy, createdAt, updatedAt
        ) VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, requestedScope, scopeKey, familyId, context?.familyName || '', date, mealType,
        at, auth.user.id, auth.user.id, at, at,
      ),
    ];
    statements.push(...dishes.map(dish => env.DB.prepare(`
      INSERT INTO meal_record_dishes (
        id, mealRecordId, originalDishId, normalizedName, nameSnapshot, typeSnapshot, imagesSnapshot, sortOrder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), id, dish.originalDishId, dish.normalizedName, dish.nameSnapshot,
      dish.typeSnapshot, dish.imagesSnapshot, dish.sortOrder,
    )));
    statements.push(...participantRows.map(participant => env.DB.prepare(`
      INSERT INTO meal_record_participants (
        id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot, note, badgeSnapshot, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      participant.id, id, participant.userId, participant.name, participant.avatar,
      participant.userId === auth.user.id ? strictText(body.note, '感想', MAX_NOTE_LENGTH, { allowNewlines: true }) : '',
      participant.badge, at, at,
    )));
    statements.push(...files.statements);
    if (files.guard) statements.push(files.guard);
    try {
      await env.DB.batch(statements);
    } catch (error) {
      if (error instanceof Error && error.message.includes('meal_record_participants.note')) {
        throw new ApiError(409, 'IMAGE_REFERENCE_CONFLICT', '部分图片已过期、冻结或被其他记录使用，请重新选择');
      }
      throw error;
    }
    await writeHistoryAudit(env, auth, familyId, 'history.created', id, { scope: requestedScope });
    await recalculateAchievements(env, auth.user.id, at);
    return json({ id, date, mealType, scope: requestedScope, source: 'manual' }, 201);
  });
}

async function updateHistory(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<HistoryInput>(request);
  const id = requiredString(body.id || body.recordId, '历史记录ID');
  const initialRecord = await findRecord(env, id);
  const familyId = initialRecord.familyId ? textValue(initialRecord.familyId) : null;
  return withHistoryMutationLocks(env, auth, familyId, false, async () => {
    const record = await findRecord(env, id);
    if (record.source !== 'manual') throw new ApiError(409, 'HISTORY_FACTS_IMMUTABLE', '自动记录的日期、餐次和菜品不能修改');
    if (record.ownerUserId !== auth.user.id) throw new ApiError(403, 'HISTORY_EDIT_FORBIDDEN', '只能修改自己创建的补记');
    if (record.frozenAt || record.deletedAt) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结或删除');
    if (body.scope !== undefined && strictText(body.scope, '记录范围', 20) !== record.scope) {
      throw new ApiError(409, 'HISTORY_SCOPE_IMMUTABLE', '已创建的回忆不能切换个人或家庭范围');
    }
    if (body.familyId !== undefined && textValue(body.familyId) !== textValue(record.familyId)) {
      throw new ApiError(409, 'HISTORY_SCOPE_IMMUTABLE', '已创建的回忆不能更换所属家庭');
    }
    const context = familyId ? await familyContextForId(auth, env, familyId) : null;
    const date = body.date === undefined ? textValue(record.date) : parseDate(body.date);
    const mealType = body.mealType === undefined ? textValue(record.mealType) : parseMealType(body.mealType);
    const dishes = body.dishIds !== undefined || body.dishes !== undefined
      ? await buildDishSnapshots(env, context, body) : null;
    const at = Date.now();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`
        UPDATE meal_records SET date = ?, mealType = ?, updatedAt = ?
        WHERE id = ? AND source = 'manual' AND ownerUserId = ?
          AND frozenAt IS NULL AND deletedAt IS NULL
      `).bind(date, mealType, at, id, auth.user.id),
    ];
    if (dishes) {
      statements.push(env.DB.prepare('DELETE FROM meal_record_dishes WHERE mealRecordId = ?').bind(id));
      statements.push(...dishes.map(dish => env.DB.prepare(`
        INSERT INTO meal_record_dishes (
          id, mealRecordId, originalDishId, normalizedName, nameSnapshot, typeSnapshot, imagesSnapshot, sortOrder
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), id, dish.originalDishId, dish.normalizedName, dish.nameSnapshot,
        dish.typeSnapshot, dish.imagesSnapshot, dish.sortOrder,
      )));
    }
    const results = await env.DB.batch(statements);
    if (!results[0]?.meta.changes) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结或删除');
    await writeHistoryAudit(env, auth, familyId, 'history.updated', id);
    await recalculateAchievements(env, auth.user.id, at);
    return json({ ...record, id, date, mealType, updatedAt: at });
  });
}

async function updateContribution(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<HistoryInput>(request);
  const id = requiredString(body.id || body.recordId, '历史记录ID');
  const initialRecord = await findRecord(env, id);
  const familyId = initialRecord.familyId ? textValue(initialRecord.familyId) : null;
  return withHistoryMutationLocks(env, auth, familyId, Boolean(familyId && body.images !== undefined), async () => {
    const record = await findRecord(env, id);
    if (record.deletedAt) throw new ApiError(404, 'HISTORY_NOT_FOUND', '餐桌回忆不存在');
    const participant = await env.DB.prepare(`
      SELECT * FROM meal_record_participants WHERE mealRecordId = ? AND userId = ?
    `).bind(id, auth.user.id).first<Record<string, unknown>>();
    if (!participant) throw new ApiError(403, 'CONTRIBUTION_FORBIDDEN', '只能编辑自己参与的回忆');
    if (participant.frozenAt || record.frozenAt) throw new ApiError(409, 'HISTORY_FROZEN', '该贡献已冻结');
    if (familyId) {
      const membership = await env.DB.prepare(`
        SELECT fm.status AS memberStatus, f.status AS familyStatus
        FROM families f LEFT JOIN family_members fm
          ON fm.familyId = f.id AND fm.userId = ?
        WHERE f.id = ?
      `).bind(auth.user.id, familyId).first<{ memberStatus: string | null; familyStatus: string }>();
      if (membership?.memberStatus !== 'active' || membership.familyStatus !== 'active') {
        throw new ApiError(409, 'HISTORY_FROZEN', '离开家庭后不能继续编辑该贡献');
      }
    }
    const note = body.note === undefined ? textValue(participant.note) : strictText(body.note, '感想', MAX_NOTE_LENGTH, { allowNewlines: true });
    const currentFiles = await filesForRecord(env, id);
    const current = currentFiles.filter(file => file.participantId === participant.id || (file.participantId === null && file.participantUserId === auth.user.id));
    const fileIds = body.images === undefined ? fileIdsFromRows(current) : extractFileIds(body.images);
    if (fileIds.length > 3) throw new ApiError(400, 'VALIDATION_ERROR', '每位参与者最多上传3张照片');
    const at = Date.now();
    const files = body.images === undefined
      ? { statements: [] as D1PreparedStatement[], rows: current, guard: null as D1PreparedStatement | null }
      : await validatePendingFiles(env, auth.user.id, fileIds, id, String(participant.id), familyId, at);
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`
        UPDATE meal_record_participants SET note = ?, updatedAt = ?
        WHERE id = ? AND userId = ? AND frozenAt IS NULL
          AND EXISTS (
            SELECT 1 FROM meal_records mr
            WHERE mr.id = meal_record_participants.mealRecordId
              AND mr.frozenAt IS NULL AND mr.deletedAt IS NULL
          )
      `).bind(note, at, participant.id, auth.user.id),
      ...files.statements,
    ];
    if (body.images !== undefined) {
      const retained = new Set(fileIds);
      for (const oldFile of current) {
        if (!retained.has(oldFile.id)) {
          statements.push(env.DB.prepare(`
            UPDATE meal_memory_files SET deletedAt = ?
            WHERE id = ? AND ownerUserId = ? AND deletedAt IS NULL AND frozenAt IS NULL
              AND EXISTS (
                SELECT 1 FROM meal_record_participants p
                JOIN meal_records mr ON mr.id = p.mealRecordId
                WHERE p.id = ? AND p.userId = ? AND p.frozenAt IS NULL
                  AND mr.id = ? AND mr.frozenAt IS NULL AND mr.deletedAt IS NULL
              )
          `).bind(at, oldFile.id, auth.user.id, participant.id, auth.user.id, id));
        }
      }
    }
    if (files.guard) statements.push(files.guard);
    let results: D1Result<unknown>[];
    try {
      results = await env.DB.batch(statements);
    } catch (error) {
      if (error instanceof Error && error.message.includes('meal_record_participants.note')) {
        throw new ApiError(409, 'IMAGE_REFERENCE_CONFLICT', '部分图片已过期、冻结或被其他记录使用，请重新选择');
      }
      throw error;
    }
    if (!results[0]?.meta.changes) throw new ApiError(409, 'HISTORY_FROZEN', '该贡献已冻结');
    await writeHistoryAudit(env, auth, familyId, 'history.contribution_updated', id);
    const achievements = await recalculateAchievements(env, auth.user.id, at);
    return json({ id, userId: auth.user.id, note, images: fileIds, newlyUnlocked: achievements.newlyUnlocked });
  });
}

async function excludeHistory(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<HistoryInput>(request);
  const id = requiredString(body.id || body.recordId, '历史记录ID');
  const initialRecord = await findRecord(env, id);
  const familyId = initialRecord.familyId ? textValue(initialRecord.familyId) : null;
  return withHistoryMutationLocks(env, auth, familyId, false, async () => {
    const participant = await env.DB.prepare(`
      SELECT p.id, p.frozenAt, mr.frozenAt AS recordFrozenAt
      FROM meal_record_participants p
      JOIN meal_records mr ON mr.id = p.mealRecordId
      WHERE p.mealRecordId = ? AND p.userId = ? AND mr.deletedAt IS NULL
    `).bind(id, auth.user.id).first<{ id: string; frozenAt: number | null; recordFrozenAt: number | null }>();
    if (!participant) throw new ApiError(404, 'HISTORY_NOT_FOUND', '个人历史记录不存在');
    if (participant.frozenAt || participant.recordFrozenAt) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结，不能移除');
    if (familyId) {
      const active = await env.DB.prepare(`
        SELECT 1 FROM family_members fm JOIN families f ON f.id = fm.familyId
        WHERE fm.familyId = ? AND fm.userId = ?
          AND fm.status = 'active' AND f.status = 'active'
      `).bind(familyId, auth.user.id).first();
      if (!active) throw new ApiError(409, 'HISTORY_FROZEN', '离开家庭后不能修改该记录');
    }
    const at = Date.now();
    const updated = await env.DB.prepare(`
      UPDATE meal_record_participants SET personalHiddenAt = ?, updatedAt = ?
      WHERE id = ? AND userId = ? AND frozenAt IS NULL
        AND EXISTS (
          SELECT 1 FROM meal_records mr
          WHERE mr.id = meal_record_participants.mealRecordId
            AND mr.frozenAt IS NULL AND mr.deletedAt IS NULL
        )
    `).bind(at, at, participant.id, auth.user.id).run();
    if (!updated.meta.changes) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结，不能移除');
    const achievements = await recalculateAchievements(env, auth.user.id, at);
    return json({ success: true, id, newlyUnlocked: achievements.newlyUnlocked });
  });
}

async function deleteHistory(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少历史记录ID');
  const initialRecord = await findRecord(env, id);
  const familyId = initialRecord.familyId ? textValue(initialRecord.familyId) : null;
  return withHistoryMutationLocks(env, auth, familyId, false, async () => {
    const record = await findRecord(env, id);
    if (record.source !== 'manual') throw new ApiError(409, 'HISTORY_AUTO_DELETE_FORBIDDEN', '自动记录只能从个人历史中移除');
    if (record.ownerUserId !== auth.user.id) throw new ApiError(403, 'HISTORY_DELETE_FORBIDDEN', '只能删除自己创建的补记');
    if (record.frozenAt || record.deletedAt) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结或删除');
    if (familyId) await familyContextForId(auth, env, familyId);
    const at = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE meal_records SET deletedAt = ?, updatedAt = ?
        WHERE id = ? AND source = 'manual' AND ownerUserId = ?
          AND frozenAt IS NULL AND deletedAt IS NULL
      `).bind(at, at, id, auth.user.id),
      env.DB.prepare(`
        UPDATE meal_memory_files SET deletedAt = ?
        WHERE mealRecordId = ? AND deletedAt IS NULL AND frozenAt IS NULL
          AND EXISTS (
            SELECT 1 FROM meal_records mr
            WHERE mr.id = meal_memory_files.mealRecordId
              AND mr.ownerUserId = ? AND mr.deletedAt = ?
          )
      `).bind(at, id, auth.user.id, at),
    ]);
    if (!results[0]?.meta.changes) throw new ApiError(409, 'HISTORY_FROZEN', '该记录已冻结或删除');
    await writeHistoryAudit(env, auth, familyId, 'history.deleted', id);
    await recalculateAchievements(env, auth.user.id, at);
    return json({ success: true, id });
  });
}

async function uploadHistoryFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await checkUploadRateLimits(env, auth.user.id, 'history-memory');
  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > 5 * 1024 * 1024 + 64 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '单张图片不能超过5MB');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', '请选择图片');
  const fileNameValue = form.get('fileName');
  const providedName = typeof fileNameValue === 'string' ? fileNameValue : undefined;
  const { safeName } = await validateUploadFile(file, IMAGE_TYPES, providedName);
  const familyIdValue = form.get('familyId');
  const familyId = typeof familyIdValue === 'string' && familyIdValue.trim() ? strictText(familyIdValue, '家庭ID', 100) : null;
  if (familyId) await familyContextForId(auth, env, familyId);
  return withHistoryMutationLocks(env, auth, familyId, Boolean(familyId), async () => {
    const context = familyId ? await familyContextForId(auth, env, familyId) : null;
    if (context) await assertFamilyUploadQuota(env, context, file.size);
    else await assertUserUploadQuota(env, auth.user.id, file.size);
    const objectKey = `users/${auth.user.id}/meal-memory/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const id = crypto.randomUUID();
    const at = Date.now();
    await env.DB.prepare(`
      INSERT INTO meal_memory_files (
        id, objectKey, ownerUserId, familyId, name, contentType, size, purpose, createdAt, expiresAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'meal-memory', ?, ?)
    `).bind(id, objectKey, auth.user.id, familyId, safeName || file.name || 'memory', file.type, file.size, at, at + PENDING_UPLOAD_TTL_MS).run();
    try {
      await env.FILE_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    } catch (error) {
      try {
        await env.DB.prepare(`
          UPDATE meal_memory_files SET deletedAt = ?, expiresAt = NULL
          WHERE id = ? AND ownerUserId = ? AND attachedAt IS NULL AND deletedAt IS NULL
        `).bind(Date.now(), id, auth.user.id).run();
      } catch (cleanupError) {
        console.error(JSON.stringify({
          message: 'history_upload.pending_cleanup_failed', fileId: id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }));
      }
      throw error;
    }
    return json({
      id,
      name: file.name || safeName,
      contentType: file.type,
      size: file.size,
      createdAt: at,
      url: await createHistoryFileAccessUrl(request, env, id),
    }, 201);
  });
}

async function downloadHistoryFile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature') || '';
  if (!id || !signature || !await verifyHistorySignature(env, id, expires, signature)) {
    throw new ApiError(403, 'FILE_SIGNATURE_INVALID', '文件访问地址已失效');
  }
  const file = await env.DB.prepare('SELECT * FROM meal_memory_files WHERE id = ? AND deletedAt IS NULL').bind(id).first<FileRow>();
  if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
  if (file.expiresAt !== null && file.expiresAt !== undefined && file.expiresAt <= Date.now()) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
  const object = await env.FILE_BUCKET.get(file.objectKey);
  if (!object?.body) throw new ApiError(404, 'FILE_OBJECT_NOT_FOUND', '文件内容不存在');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', file.contentType);
  headers.set('Content-Length', String(file.size));
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  return new Response(object.body, { headers });
}

export async function handleHistoryV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/history/list': return listHistory(request, env);
    case 'GET /api/history/detail': return detailHistory(request, env);
    case 'POST /api/history/create': return createHistory(request, env);
    case 'PUT /api/history/update': return updateHistory(request, env);
    case 'PUT /api/history/contribution': return updateContribution(request, env);
    case 'PUT /api/history/exclude': return excludeHistory(request, env);
    case 'DELETE /api/history/delete': return deleteHistory(request, env);
    case 'POST /api/history/file/upload': return uploadHistoryFile(request, env);
    case 'GET /api/history/file/download': return downloadHistoryFile(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
