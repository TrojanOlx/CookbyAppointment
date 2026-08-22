import { checkRateLimit } from '../core/auth';
import { normalizeIngredientName, normalizeQuantity, parseQuantityText } from '../core/domain';
import { ApiError, json, pagination, parseJsonField, readJson, requiredString } from '../core/http';
import { userLifecycleLockScope, withOperationLock } from '../core/operationLock';
import {
  createPlatformAssetUrl,
  createStablePlatformAssetPath,
  downloadPlatformAsset,
  platformAssetIdFromUrl,
  resolvePlatformAssetUrls,
} from '../core/platformAssets';
import {
  platformAdminStatus,
  requirePlatformAdmin,
  type PlatformAdminContext,
} from '../core/platformAuth';
import type { Env } from '../core/types';

const PLATFORM_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PLATFORM_IDEMPOTENCY_SCOPE = '__platform__';
const PLATFORM_ASSET_LOCK = 'platform-template-assets';
const PLATFORM_INGREDIENT_LOCK = 'platform-ingredient-catalog';

function nextVersion(current: unknown): number {
  return Math.max(Date.now(), Number(current || 0) + 1);
}

function platformAuditInsert(
  env: Env,
  context: PlatformAdminContext,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: unknown,
  createdAt = Date.now(),
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), context.user.id, action, targetType || null, targetId || null,
    details === undefined ? null : JSON.stringify(details), createdAt,
  );
}

async function withPlatformIdempotency(
  request: Request,
  env: Env,
  context: PlatformAdminContext,
  operation: string,
  execute: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get('Idempotency-Key')?.trim();
  if (!key) return execute();
  if (key.length > 128) throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', '幂等键过长');
  const now = Date.now();
  await env.DB.prepare('DELETE FROM idempotency_keys WHERE createdAt < ?')
    .bind(now - 7 * 24 * 60 * 60 * 1000).run();
  const claimed = await env.DB.prepare(`
    INSERT INTO idempotency_keys (familyId, userId, key, operation, createdAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(familyId, userId, operation, key) DO UPDATE SET
      responseStatus = NULL, responseBody = NULL, createdAt = excluded.createdAt
    WHERE idempotency_keys.responseBody IS NULL AND idempotency_keys.createdAt <= ?
  `).bind(
    PLATFORM_IDEMPOTENCY_SCOPE, context.user.id, key, operation, now, now - 5 * 60 * 1000,
  ).run();
  if (!claimed.meta.changes) {
    const existing = await env.DB.prepare(`
      SELECT responseStatus, responseBody FROM idempotency_keys
      WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?
    `).bind(PLATFORM_IDEMPOTENCY_SCOPE, context.user.id, operation, key)
      .first<{ responseStatus: number | null; responseBody: string | null }>();
    if (existing?.responseBody) {
      return new Response(existing.responseBody, {
        status: existing.responseStatus || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new ApiError(409, 'OPERATION_IN_PROGRESS', '相同操作正在处理中');
  }
  try {
    const response = await execute();
    const responseBody = await response.clone().text();
    await env.DB.prepare(`
      UPDATE idempotency_keys SET responseStatus = ?, responseBody = ?
      WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?
    `).bind(
      response.status, responseBody, PLATFORM_IDEMPOTENCY_SCOPE, context.user.id, operation, key,
    ).run();
    return response;
  } catch (error) {
    await env.DB.prepare(`
      DELETE FROM idempotency_keys WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?
    `).bind(PLATFORM_IDEMPOTENCY_SCOPE, context.user.id, operation, key).run();
    throw error;
  }
}

async function assertPlatformAssetsActive(env: Env, images: string[]): Promise<void> {
  const ids = Array.from(new Set(images.map(platformAssetIdFromUrl).filter((id): id is string => Boolean(id))));
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const active = await env.DB.prepare(`
    SELECT id FROM platform_files WHERE deletedAt IS NULL AND id IN (${placeholders})
  `).bind(...ids).all<{ id: string }>();
  const activeIds = new Set(active.results.map(item => item.id));
  const missing = ids.filter(id => !activeIds.has(id));
  if (missing.length) {
    throw new ApiError(409, 'TEMPLATE_ASSET_MISSING', '菜谱图片已删除或不存在，请重新选择', { fileIds: missing });
  }
}

interface TemplateIngredientInput {
  ingredientId?: unknown;
  name?: unknown;
  amount?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

interface TemplateInput {
  name?: unknown;
  type?: unknown;
  spicy?: unknown;
  images?: unknown;
  steps?: unknown;
  notice?: unknown;
  remark?: unknown;
  reference?: unknown;
  sortOrder?: unknown;
  ingredients?: unknown;
  expectedUpdatedAt?: unknown;
}

interface NormalizedTemplateIngredient {
  id: string;
  ingredientId: string;
  name: string;
  amount: string;
  quantity: number | null;
  unit: string | null;
  legacyAmount: string | null;
  sortOrder: number;
}

function stringList(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'VALIDATION_ERROR', `${field}格式错误`, { field });
  return value.slice(0, maxItems).map(item => requiredString(item, field, maxLength));
}

function integer(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function publicAvatar(value: unknown): string {
  return typeof value === 'string' && value.startsWith('https://') && !value.includes('/api/file/download') ? value : '';
}

async function overview(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const [users, families, templates, ingredients, audits] = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
        SUM(CASE WHEN createTime >= ? THEN 1 ELSE 0 END) AS recent
      FROM users
    `).bind(Date.now() - 7 * 24 * 60 * 60 * 1000),
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'dissolved' THEN 1 ELSE 0 END) AS dissolved
      FROM families
    `),
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
      FROM recipe_templates
    `),
    env.DB.prepare('SELECT COUNT(*) AS total FROM ingredient_catalog'),
    env.DB.prepare(`
      SELECT ae.id, ae.action, ae.targetType, ae.targetId, ae.createdAt,
        u.nickName AS actorName
      FROM audit_events ae LEFT JOIN users u ON u.id = ae.actorUserId
      WHERE ae.familyId IS NULL AND ae.action LIKE 'platform.%'
      ORDER BY ae.createdAt DESC LIMIT 8
    `),
  ]);
  return json({
    users: users.results[0] || {},
    families: families.results[0] || {},
    templates: templates.results[0] || {},
    ingredients: ingredients.results[0] || {},
    recentAudit: audits.results,
  });
}

async function listUsers(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 80);
  const status = url.searchParams.get('status');
  const conditions = ['1 = 1'];
  const bindings: unknown[] = [];
  if (status === 'active' || status === 'suspended') {
    conditions.push('u.status = ?');
    bindings.push(status);
  }
  if (keyword) {
    conditions.push("(u.id LIKE ? OR COALESCE(u.nickName, '') LIKE ?)");
    bindings.push(`%${keyword}%`, `%${keyword}%`);
  }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT u.id, u.nickName, u.avatarUrl, u.status, u.createTime, u.updateTime,
        u.suspendedAt, u.suspendReason,
        EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.userId = u.id AND pa.status = 'active') AS isPlatformAdmin,
        (SELECT COUNT(*) FROM family_members fm WHERE fm.userId = u.id AND fm.status = 'active') AS familyCount,
        (SELECT MAX(s.lastSeenAt) FROM user_sessions s WHERE s.userId = u.id) AS lastSeenAt
      FROM users u WHERE ${where}
      ORDER BY u.createTime DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: rows.results.map(row => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        avatarUrl: publicAvatar(item.avatarUrl),
        isPlatformAdmin: Number(item.isPlatformAdmin || 0) === 1,
      };
    }),
    page,
    pageSize,
  });
}

async function userDetail(request: Request, env: Env, userId: string): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const user = await env.DB.prepare(`
    SELECT u.id, u.nickName, u.avatarUrl, u.status, u.createTime, u.updateTime,
      u.suspendedAt, u.suspendReason,
      EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.userId = u.id AND pa.status = 'active') AS isPlatformAdmin,
      (SELECT MAX(s.lastSeenAt) FROM user_sessions s WHERE s.userId = u.id) AS lastSeenAt,
      (SELECT COUNT(*) FROM user_sessions s WHERE s.userId = u.id AND s.revokedAt IS NULL AND s.expiresAt > ?) AS activeSessionCount
    FROM users u WHERE u.id = ?
  `).bind(Date.now(), userId).first<Record<string, unknown>>();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  const families = await env.DB.prepare(`
    SELECT f.id, f.name, f.status AS familyStatus, fm.role, fm.status AS membershipStatus, fm.joinedAt,
      (SELECT COUNT(*) FROM family_members members WHERE members.familyId = f.id AND members.status = 'active') AS memberCount,
      (SELECT COUNT(*) FROM dishes d WHERE d.familyId = f.id) AS dishCount,
      (SELECT COUNT(*) FROM appointments a WHERE a.familyId = f.id) AS appointmentCount,
      (SELECT COUNT(*) FROM inventory_items i WHERE i.familyId = f.id) AS inventoryCount,
      (SELECT COUNT(*) FROM shopping_list_items si JOIN shopping_lists sl ON sl.id = si.shoppingListId WHERE sl.familyId = f.id) AS shoppingItemCount
    FROM family_members fm JOIN families f ON f.id = fm.familyId
    WHERE fm.userId = ? ORDER BY fm.joinedAt DESC
  `).bind(userId).all();
  return json({
    ...user,
    avatarUrl: publicAvatar(user.avatarUrl),
    isPlatformAdmin: Number(user.isPlatformAdmin || 0) === 1,
    families: families.results,
  });
}

async function assertMutableUser(
  env: Env,
  context: PlatformAdminContext,
  userId: string,
  checkOwnership: boolean,
): Promise<Record<string, unknown>> {
  const target = await env.DB.prepare(`
    SELECT u.id, u.nickName, u.status,
      EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.userId = u.id AND pa.status = 'active') AS isPlatformAdmin
    FROM users u WHERE u.id = ?
  `).bind(userId).first<Record<string, unknown>>();
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  if (userId === context.user.id || Number(target.isPlatformAdmin || 0) === 1) {
    throw new ApiError(409, 'PLATFORM_ADMIN_PROTECTED', '不能对平台管理员执行此操作');
  }
  if (checkOwnership) {
    const owned = await env.DB.prepare(`
      SELECT f.id, f.name FROM family_members fm JOIN families f ON f.id = fm.familyId
      WHERE fm.userId = ? AND fm.role = 'owner' AND fm.status = 'active' AND f.status = 'active'
      ORDER BY f.createdAt
    `).bind(userId).all();
    if (owned.results.length) {
      throw new ApiError(409, 'ACTIVE_FAMILY_OWNER', '该用户仍是活跃家庭的家庭主，需先转让或解散家庭', {
        families: owned.results,
      });
    }
  }
  return target;
}

async function revokeSessions(request: Request, env: Env, userId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withOperationLock(env, userLifecycleLockScope(userId), async () => {
    await assertMutableUser(env, context, userId, false);
    const now = Date.now();
    const [result] = await env.DB.batch([
      env.DB.prepare(`
        UPDATE user_sessions SET revokedAt = COALESCE(revokedAt, ?) WHERE userId = ? AND revokedAt IS NULL
      `).bind(now, userId),
      platformAuditInsert(env, context, 'platform.user.sessions_revoked', 'user', userId, {
        reason: '平台管理员主动撤销',
      }, now),
    ]);
    return json({ success: true, revokedCount: result.meta.changes });
  });
}

async function suspendUser(request: Request, env: Env, userId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  const body = await readJson<{ reason?: unknown }>(request);
  const reason = requiredString(body.reason, '停用原因', 200);
  return withOperationLock(env, userLifecycleLockScope(userId), async () => {
    const target = await assertMutableUser(env, context, userId, true);
    if (target.status === 'suspended') return json({ success: true, alreadySuspended: true });
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE users SET status = 'suspended', suspendedAt = ?, suspendedBy = ?, suspendReason = ?, updateTime = ?
        WHERE id = ? AND status = 'active'
      `).bind(now, context.user.id, reason, now, userId),
      env.DB.prepare(`
        UPDATE user_sessions SET revokedAt = COALESCE(revokedAt, ?) WHERE userId = ?
      `).bind(now, userId),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        VALUES (?, NULL, ?, 'platform.user.suspended', 'user', ?, ?, ?)
      `).bind(crypto.randomUUID(), context.user.id, userId, JSON.stringify({ reason }), now),
    ]);
    return json({ success: true, suspendedAt: now });
  });
}

async function restoreUser(request: Request, env: Env, userId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withOperationLock(env, userLifecycleLockScope(userId), async () => {
    const target = await assertMutableUser(env, context, userId, false);
    if (target.status === 'active') return json({ success: true, alreadyActive: true });
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE users SET status = 'active', suspendedAt = NULL, suspendedBy = NULL,
          suspendReason = NULL, updateTime = ? WHERE id = ? AND status = 'suspended'
      `).bind(now, userId),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        VALUES (?, NULL, ?, 'platform.user.restored', 'user', ?, NULL, ?)
      `).bind(crypto.randomUUID(), context.user.id, userId, now),
    ]);
    return json({ success: true, restoredAt: now });
  });
}

async function listFamilies(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 80);
  const status = url.searchParams.get('status');
  const conditions = ['1 = 1'];
  const bindings: unknown[] = [];
  if (status === 'active' || status === 'dissolved') {
    conditions.push('f.status = ?');
    bindings.push(status);
  }
  if (keyword) {
    conditions.push('(f.id LIKE ? OR f.name LIKE ?)');
    bindings.push(`%${keyword}%`, `%${keyword}%`);
  }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM families f WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT f.id, f.name, f.status, f.timezone, f.createdAt, f.updatedAt, f.dissolvedAt,
        owner.userId AS ownerUserId, u.nickName AS ownerName,
        (SELECT COUNT(*) FROM family_members fm WHERE fm.familyId = f.id AND fm.status = 'active') AS memberCount,
        (SELECT COUNT(*) FROM dishes d WHERE d.familyId = f.id) AS dishCount,
        (SELECT COUNT(*) FROM appointments a WHERE a.familyId = f.id) AS appointmentCount,
        (SELECT COUNT(*) FROM inventory_items i WHERE i.familyId = f.id) AS inventoryCount,
        (SELECT COUNT(*) FROM shopping_list_items si JOIN shopping_lists sl ON sl.id = si.shoppingListId WHERE sl.familyId = f.id) AS shoppingItemCount
      FROM families f
      LEFT JOIN family_members owner ON owner.familyId = f.id AND owner.role = 'owner' AND owner.status = 'active'
      LEFT JOIN users u ON u.id = owner.userId
      WHERE ${where}
      ORDER BY f.createdAt DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: rows.results,
    page,
    pageSize,
  });
}

async function resolveCatalog(env: Env, name: string, requestedId?: unknown): Promise<string> {
  const normalized = normalizeIngredientName(name);
  if (typeof requestedId === 'string' && requestedId) {
    const requested = await env.DB.prepare(`
      SELECT c.id, c.canonicalName, group_concat(a.alias, '|') AS aliases
      FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
      WHERE c.id = ? GROUP BY c.id
    `).bind(requestedId).first<{ id: string; canonicalName: string; aliases: string | null }>();
    const names = requested ? [requested.canonicalName, ...(requested.aliases || '').split('|')] : [];
    if (requested && names.some(value => value && normalizeIngredientName(value) === normalized)) {
      return requested.id;
    }
  }
  const [catalog, aliases] = await env.DB.batch([
    env.DB.prepare('SELECT id, canonicalName FROM ingredient_catalog'),
    env.DB.prepare('SELECT ingredientId, alias FROM ingredient_aliases'),
  ]);
  const canonicalMatch = catalog.results.find(row => {
    const item = row as { canonicalName?: unknown };
    return typeof item.canonicalName === 'string' && normalizeIngredientName(item.canonicalName) === normalized;
  }) as { id?: unknown } | undefined;
  if (typeof canonicalMatch?.id === 'string') return canonicalMatch.id;
  const aliasMatch = aliases.results.find(row => {
    const item = row as { alias?: unknown };
    return typeof item.alias === 'string' && normalizeIngredientName(item.alias) === normalized;
  }) as { ingredientId?: unknown } | undefined;
  if (typeof aliasMatch?.ingredientId === 'string') return aliasMatch.ingredientId;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ingredient_catalog (id, canonicalName, category, createdAt, updatedAt)
    VALUES (?, ?, '其他', ?, ?)
  `).bind(id, name, now, now).run();
  return id;
}

async function normalizeTemplateIngredients(env: Env, value: unknown): Promise<NormalizedTemplateIngredient[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 80) {
    throw new ApiError(400, 'VALIDATION_ERROR', '模板需要 1 至 80 项食材');
  }
  const normalized: NormalizedTemplateIngredient[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const input = value[index] as TemplateIngredientInput;
    const name = requiredString(input.name, '食材名称', 80);
    const ingredientId = await resolveCatalog(env, name, input.ingredientId);
    const amount = typeof input.amount === 'string' ? input.amount.trim().slice(0, 100) : '';
    let quantity: number | null = null;
    let unit: string | null = null;
    let legacyAmount: string | null = null;
    if (amount) {
      const parsed = parseQuantityText(amount);
      quantity = parsed?.quantity ?? null;
      unit = parsed?.unit ?? null;
      legacyAmount = parsed ? null : amount;
    } else if (typeof input.quantity === 'number' && typeof input.unit === 'string') {
      if (!normalizeQuantity(input.quantity, input.unit)) {
        throw new ApiError(400, 'INVALID_QUANTITY', `${name}的数量单位无法换算`);
      }
      quantity = input.quantity;
      unit = input.unit.trim().slice(0, 20);
    } else {
      throw new ApiError(400, 'INVALID_QUANTITY', `${name}缺少用量`);
    }
    normalized.push({
      id: crypto.randomUUID(), ingredientId, name,
      amount: amount || `${quantity}${unit}`,
      quantity, unit, legacyAmount, sortOrder: (index + 1) * 10,
    });
  }
  return normalized;
}

async function mapTemplate(request: Request, env: Env, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const images = parseJsonField<string[]>(row.images, []).filter(item => typeof item === 'string');
  const ingredients = await env.DB.prepare(`
    SELECT id, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder
    FROM recipe_template_ingredients WHERE templateId = ? ORDER BY sortOrder, id
  `).bind(String(row.id)).all();
  return {
    ...row,
    images: await resolvePlatformAssetUrls(request, env, images),
    steps: parseJsonField<string[]>(row.steps, []),
    ingredients: ingredients.results,
  };
}

async function listTemplates(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const status = url.searchParams.get('status');
  const type = (url.searchParams.get('type') || '').trim().slice(0, 40);
  const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 80);
  const conditions = ['1 = 1'];
  const bindings: unknown[] = [];
  if (status === 'active' || status === 'archived') { conditions.push('status = ?'); bindings.push(status); }
  if (type) { conditions.push('type = ?'); bindings.push(type); }
  if (keyword) { conditions.push('(name LIKE ? OR templateKey LIKE ?)'); bindings.push(`%${keyword}%`, `%${keyword}%`); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM recipe_templates WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT * FROM recipe_templates WHERE ${where}
      ORDER BY status = 'active' DESC, sortOrder, createdAt DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: await Promise.all(rows.results.map(row => mapTemplate(request, env, row as Record<string, unknown>))),
    page,
    pageSize,
  });
}

async function getTemplate(request: Request, env: Env, templateId: string): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const row = await env.DB.prepare('SELECT * FROM recipe_templates WHERE id = ?')
    .bind(templateId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, 'RECIPE_TEMPLATE_NOT_FOUND', '菜谱模板不存在');
  return json(await mapTemplate(request, env, row));
}

async function templateValues(env: Env, body: TemplateInput, current?: Record<string, unknown>) {
  const value = (key: keyof TemplateInput, fallback: unknown) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : fallback;
  const name = requiredString(value('name', current?.name), '菜名', 80);
  const type = requiredString(value('type', current?.type), '菜品类型', 40);
  const spicy = requiredString(value('spicy', current?.spicy || '不辣'), '辣度', 20);
  const rawImages = stringList(value('images', parseJsonField(current?.images, [])), '图片', 6, 1000);
  for (const image of rawImages) {
    if (!platformAssetIdFromUrl(image)) {
      throw new ApiError(400, 'TEMPLATE_IMAGE_INVALID', '模板图片必须先上传到平台素材库');
    }
  }
  const images = rawImages.map(image => {
    const assetId = platformAssetIdFromUrl(image);
    return assetId ? createStablePlatformAssetPath(assetId) : image;
  });
  await assertPlatformAssetsActive(env, images);
  const steps = stringList(value('steps', parseJsonField(current?.steps, [])), '步骤', 30, 500);
  if (!steps.length) throw new ApiError(400, 'VALIDATION_ERROR', '模板至少需要一个步骤');
  const ingredients = await normalizeTemplateIngredients(env, value('ingredients', undefined));
  return {
    name, type, spicy, images, steps, ingredients,
    notice: typeof value('notice', current?.notice || '') === 'string' ? String(value('notice', current?.notice || '')).trim().slice(0, 1000) : '',
    remark: typeof value('remark', current?.remark || '') === 'string' ? String(value('remark', current?.remark || '')).trim().slice(0, 1000) : '',
    reference: typeof value('reference', current?.reference || '') === 'string' ? String(value('reference', current?.reference || '')).trim().slice(0, 1000) : '',
    sortOrder: integer(value('sortOrder', current?.sortOrder || 0), 0),
  };
}

function ingredientInsert(env: Env, templateId: string, item: NormalizedTemplateIngredient): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO recipe_template_ingredients
      (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.id, templateId, item.ingredientId, item.name, item.amount,
    item.quantity, item.unit, item.legacyAmount, item.sortOrder,
  );
}

async function createTemplate(request: Request, env: Env): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withPlatformIdempotency(request, env, context, 'platform.recipe_template.create', () =>
    withOperationLock(env, PLATFORM_ASSET_LOCK, () =>
      withOperationLock(env, PLATFORM_INGREDIENT_LOCK, async () => {
        const body = await readJson<TemplateInput>(request);
        const values = await templateValues(env, body);
        const id = crypto.randomUUID();
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO recipe_templates (
              id, templateKey, name, type, spicy, images, steps, notice, remark, reference,
              status, sortOrder, createdAt, updatedAt, createdBy, updatedBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'archived', ?, ?, ?, ?, ?)
          `).bind(
            id, `custom:${id}`, values.name, values.type, values.spicy, JSON.stringify(values.images),
            JSON.stringify(values.steps), values.notice, values.remark, values.reference,
            values.sortOrder, now, now, context.user.id, context.user.id,
          ),
          ...values.ingredients.map(item => ingredientInsert(env, id, item)),
          platformAuditInsert(env, context, 'platform.recipe_template.created', 'recipe_template', id, {
            name: values.name,
          }, now),
        ]);
        const row = await env.DB.prepare('SELECT * FROM recipe_templates WHERE id = ?').bind(id).first<Record<string, unknown>>();
        return json(await mapTemplate(request, env, row || { id }), 201);
      })));
}

async function updateTemplate(request: Request, env: Env, templateId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  const body = await readJson<TemplateInput>(request);
  const expectedUpdatedAt = Number(body.expectedUpdatedAt);
  if (!Number.isFinite(expectedUpdatedAt)) {
    throw new ApiError(400, 'EXPECTED_VERSION_REQUIRED', '保存模板需要最新版本号');
  }
  return withOperationLock(env, PLATFORM_ASSET_LOCK, () =>
    withOperationLock(env, PLATFORM_INGREDIENT_LOCK, () =>
      withOperationLock(env, `platform-template:${templateId}`, async () => {
        const current = await env.DB.prepare('SELECT * FROM recipe_templates WHERE id = ?')
          .bind(templateId).first<Record<string, unknown>>();
        if (!current) throw new ApiError(404, 'RECIPE_TEMPLATE_NOT_FOUND', '菜谱模板不存在');
        if (Number(current.updatedAt) !== expectedUpdatedAt) {
          throw new ApiError(409, 'TEMPLATE_VERSION_CONFLICT', '模板已被更新，请刷新后重试', { currentUpdatedAt: current.updatedAt });
        }
        const currentIngredients = await env.DB.prepare(`
          SELECT ingredientId, name, amount, quantity, unit FROM recipe_template_ingredients
          WHERE templateId = ? ORDER BY sortOrder
        `).bind(templateId).all();
        const values = await templateValues(env, {
          ...body,
          ingredients: Object.prototype.hasOwnProperty.call(body, 'ingredients') ? body.ingredients : currentIngredients.results,
        }, current);
        const now = nextVersion(current.updatedAt);
        const update = env.DB.prepare(`
          UPDATE recipe_templates SET name = ?, type = ?, spicy = ?, images = ?, steps = ?, notice = ?,
            remark = ?, reference = ?, sortOrder = ?, updatedAt = ?, updatedBy = ?
          WHERE id = ? AND updatedAt = ?
        `).bind(
          values.name, values.type, values.spicy, JSON.stringify(values.images), JSON.stringify(values.steps),
          values.notice, values.remark, values.reference, values.sortOrder, now, context.user.id,
          templateId, expectedUpdatedAt,
        );
        await env.DB.batch([
          update,
          env.DB.prepare('DELETE FROM recipe_template_ingredients WHERE templateId = ?').bind(templateId),
          ...values.ingredients.map(item => ingredientInsert(env, templateId, item)),
          platformAuditInsert(env, context, 'platform.recipe_template.updated', 'recipe_template', templateId, {
            name: values.name,
          }, now),
        ]);
        const row = await env.DB.prepare('SELECT * FROM recipe_templates WHERE id = ?').bind(templateId).first<Record<string, unknown>>();
        return json(await mapTemplate(request, env, row || { id: templateId }));
      })));
}

async function setTemplateStatus(request: Request, env: Env, templateId: string, status: 'active' | 'archived'): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  const body = await readJson<{ expectedUpdatedAt?: unknown }>(request);
  const expectedUpdatedAt = Number(body.expectedUpdatedAt);
  if (!Number.isFinite(expectedUpdatedAt)) {
    throw new ApiError(400, 'EXPECTED_VERSION_REQUIRED', '变更模板状态需要最新版本号');
  }
  return withOperationLock(env, PLATFORM_ASSET_LOCK, () =>
    withOperationLock(env, `platform-template:${templateId}`, async () => {
    const current = await env.DB.prepare('SELECT id, name, status, images, updatedAt FROM recipe_templates WHERE id = ?')
      .bind(templateId).first<{ id: string; name: string; status: string; images: string; updatedAt: number }>();
    if (!current) throw new ApiError(404, 'RECIPE_TEMPLATE_NOT_FOUND', '菜谱模板不存在');
    if (Number(current.updatedAt) !== expectedUpdatedAt) {
      throw new ApiError(409, 'TEMPLATE_VERSION_CONFLICT', '模板已被更新，请刷新后重试', {
        currentUpdatedAt: current.updatedAt,
      });
    }
    if (current.status === status) {
      return json({ id: templateId, status, updatedAt: current.updatedAt, unchanged: true });
    }
    if (status === 'active') {
      await assertPlatformAssetsActive(env, parseJsonField<string[]>(current.images, []));
    }
    const now = nextVersion(current.updatedAt);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE recipe_templates SET status = ?, updatedAt = ?, updatedBy = ?,
          publishedAt = CASE WHEN ? = 'active' THEN COALESCE(publishedAt, ?) ELSE publishedAt END,
          archivedAt = CASE WHEN ? = 'archived' THEN ? ELSE NULL END
        WHERE id = ? AND updatedAt = ?
      `).bind(status, now, context.user.id, status, now, status, now, templateId, expectedUpdatedAt),
      platformAuditInsert(
        env, context,
        status === 'active' ? 'platform.recipe_template.published' : 'platform.recipe_template.archived',
        'recipe_template', templateId, { name: current.name }, now,
      ),
    ]);
    return json({ id: templateId, status, updatedAt: now });
  }));
}

async function uploadTemplateAsset(request: Request, env: Env): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withPlatformIdempotency(request, env, context, 'platform.template_asset.upload', async () => {
    await checkRateLimit(env, `platform-file-upload:${context.user.id}`, 30, 60 * 60 * 1000);
    const maxBytes = Math.min(5 * 1024 * 1024, Math.max(1024, Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024)));
    const contentLength = Number(request.headers.get('Content-Length') || '0');
    if (contentLength > maxBytes + 64 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '图片过大');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', '请选择图片');
    if (file.size > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', '模板图片不能超过 5MB');
    if (!PLATFORM_IMAGE_TYPES.has(file.type)) throw new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', '仅支持 JPG、PNG 或 WebP 图片');
    const id = crypto.randomUUID();
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const objectKey = `platform/recipe-templates/${Date.now()}/${id}.${extension}`;
    await env.FILE_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    const now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO platform_files (id, objectKey, name, contentType, size, purpose, uploadedBy, createdAt)
          VALUES (?, ?, ?, ?, ?, 'recipe-template', ?, ?)
        `).bind(id, objectKey, file.name || `${id}.${extension}`, file.type, file.size, context.user.id, now),
        platformAuditInsert(env, context, 'platform.template_asset.uploaded', 'platform_file', id, {
          size: file.size,
        }, now),
      ]);
    } catch (error) {
      await env.FILE_BUCKET.delete(objectKey);
      throw error;
    }
    return json({
      id,
      filePath: createStablePlatformAssetPath(id),
      url: await createPlatformAssetUrl(request, env, id),
      contentType: file.type,
      size: file.size,
    }, 201);
  });
}

async function deleteTemplateAsset(request: Request, env: Env, fileId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withOperationLock(env, PLATFORM_ASSET_LOCK, async () => {
    const file = await env.DB.prepare('SELECT id, objectKey FROM platform_files WHERE id = ? AND deletedAt IS NULL')
      .bind(fileId).first<{ id: string; objectKey: string }>();
    if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '图片不存在');
    const referenced = await env.DB.prepare(`
      SELECT rt.id, rt.name FROM recipe_templates rt
      WHERE EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(rt.images) THEN rt.images ELSE '[]' END) image
        WHERE image.value = ?
      ) LIMIT 1
    `).bind(createStablePlatformAssetPath(fileId)).first();
    if (referenced) throw new ApiError(409, 'FILE_IN_USE', '图片仍被菜谱模板使用', { template: referenced });
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE platform_files SET deletedAt = ? WHERE id = ? AND deletedAt IS NULL')
        .bind(now, fileId),
      platformAuditInsert(env, context, 'platform.template_asset.deleted', 'platform_file', fileId, undefined, now),
    ]);
    try {
      await env.FILE_BUCKET.delete(file.objectKey);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'platform_asset.object_delete_failed', fileId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    return json({ success: true });
  });
}

async function listIngredients(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 80);
  const category = (url.searchParams.get('category') || '').trim().slice(0, 40);
  const conditions = ['1 = 1'];
  const bindings: unknown[] = [];
  if (keyword) {
    conditions.push('(c.canonicalName LIKE ? OR EXISTS (SELECT 1 FROM ingredient_aliases ia WHERE ia.ingredientId = c.id AND ia.alias LIKE ?))');
    bindings.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (category) { conditions.push('c.category = ?'); bindings.push(category); }
  const where = conditions.join(' AND ');
  const [count, rows, categories] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM ingredient_catalog c WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT c.id, c.canonicalName, c.category, c.defaultUnit, c.createdAt, c.updatedAt,
        group_concat(a.alias, '|') AS aliasText
      FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
      WHERE ${where} GROUP BY c.id
      ORDER BY c.category, c.canonicalName LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
    env.DB.prepare(`
      SELECT DISTINCT category FROM ingredient_catalog
      WHERE category IS NOT NULL AND trim(category) <> '' ORDER BY category
    `),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: rows.results.map(row => {
      const item = row as Record<string, unknown>;
      const aliasText = typeof item.aliasText === 'string' ? item.aliasText : '';
      return { ...item, aliases: aliasText.split('|').filter(Boolean), aliasText: undefined };
    }),
    categories: categories.results.map(row => {
      const category = (row as { category?: unknown }).category;
      return typeof category === 'string' ? category : '';
    }).filter(Boolean),
    page,
    pageSize,
  });
}

function normalizeAliases(value: unknown, canonicalName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'VALIDATION_ERROR', '食材别名格式错误');
  const canonical = normalizeIngredientName(canonicalName);
  const seen = new Set<string>([canonical]);
  const aliases: string[] = [];
  for (const item of value) {
    const alias = requiredString(item, '食材别名', 80);
    const normalized = normalizeIngredientName(alias);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(alias);
    if (aliases.length >= 30) break;
  }
  return aliases;
}

async function assertIngredientNamesAvailable(
  env: Env,
  canonicalName: string,
  aliases: string[],
  excludeIngredientId?: string,
): Promise<void> {
  const desired = new Set([canonicalName, ...aliases].map(normalizeIngredientName));
  const [catalog, existingAliases] = await env.DB.batch([
    env.DB.prepare('SELECT id, canonicalName FROM ingredient_catalog'),
    env.DB.prepare('SELECT ingredientId, alias FROM ingredient_aliases'),
  ]);
  const conflict = catalog.results.find(row => {
    const item = row as { id?: unknown; canonicalName?: unknown };
    const id = typeof item.id === 'string' ? item.id : '';
    const name = typeof item.canonicalName === 'string' ? item.canonicalName : '';
    return id !== String(excludeIngredientId || '') && desired.has(normalizeIngredientName(name));
  }) || existingAliases.results.find(row => {
    const item = row as { ingredientId?: unknown; alias?: unknown };
    const ingredientId = typeof item.ingredientId === 'string' ? item.ingredientId : '';
    const alias = typeof item.alias === 'string' ? item.alias : '';
    return ingredientId !== String(excludeIngredientId || '') && desired.has(normalizeIngredientName(alias));
  });
  if (conflict) throw new ApiError(409, 'INGREDIENT_NAME_CONFLICT', '食材名称或别名已存在');
}

function isUniqueConstraintError(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error).includes('UNIQUE constraint failed');
}

function defaultUnit(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const unit = requiredString(value, '默认单位', 20);
  if (!normalizeQuantity(1, unit)) throw new ApiError(400, 'INVALID_QUANTITY', '默认单位不支持换算');
  return unit;
}

async function createIngredient(request: Request, env: Env): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  return withPlatformIdempotency(request, env, context, 'platform.ingredient.create', () =>
    withOperationLock(env, PLATFORM_INGREDIENT_LOCK, async () => {
      const body = await readJson<{ canonicalName?: unknown; category?: unknown; defaultUnit?: unknown; aliases?: unknown }>(request);
      const canonicalName = requiredString(body.canonicalName, '标准名称', 80);
      const category = requiredString(body.category || '其他', '分类', 40);
      const unit = defaultUnit(body.defaultUnit);
      const aliases = normalizeAliases(body.aliases, canonicalName);
      await assertIngredientNamesAvailable(env, canonicalName, aliases);
      const id = crypto.randomUUID();
      const now = Date.now();
      try {
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO ingredient_catalog (id, canonicalName, category, defaultUnit, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(id, canonicalName, category, unit, now, now),
          ...aliases.map(alias => env.DB.prepare(`
            INSERT INTO ingredient_aliases (id, ingredientId, alias, createdAt) VALUES (?, ?, ?, ?)
          `).bind(crypto.randomUUID(), id, alias, now)),
          platformAuditInsert(env, context, 'platform.ingredient.created', 'ingredient', id, {
            canonicalName,
          }, now),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ApiError(409, 'INGREDIENT_NAME_CONFLICT', '食材名称或别名已存在');
        }
        throw error;
      }
      return json({ id, canonicalName, category, defaultUnit: unit, aliases, createdAt: now, updatedAt: now }, 201);
    }));
}

async function updateIngredient(request: Request, env: Env, ingredientId: string): Promise<Response> {
  const context = await requirePlatformAdmin(request, env);
  const body = await readJson<{ canonicalName?: unknown; category?: unknown; defaultUnit?: unknown; aliases?: unknown; expectedUpdatedAt?: unknown }>(request);
  return withOperationLock(env, PLATFORM_INGREDIENT_LOCK, () =>
    withOperationLock(env, `platform-ingredient:${ingredientId}`, async () => {
    const current = await env.DB.prepare('SELECT * FROM ingredient_catalog WHERE id = ?')
      .bind(ingredientId).first<Record<string, unknown>>();
    if (!current) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    const expectedUpdatedAt = Number(body.expectedUpdatedAt);
    if (!Number.isFinite(expectedUpdatedAt) || expectedUpdatedAt !== Number(current.updatedAt)) {
      throw new ApiError(409, 'INGREDIENT_VERSION_CONFLICT', '食材目录已被更新，请刷新后重试', { currentUpdatedAt: current.updatedAt });
    }
    const canonicalName = requiredString(body.canonicalName ?? current.canonicalName, '标准名称', 80);
    const category = requiredString(body.category ?? current.category, '分类', 40);
    const unit = Object.prototype.hasOwnProperty.call(body, 'defaultUnit') ? defaultUnit(body.defaultUnit) : (current.defaultUnit as string | null);
    const existingAliases = await env.DB.prepare('SELECT alias FROM ingredient_aliases WHERE ingredientId = ? ORDER BY alias')
      .bind(ingredientId).all<{ alias: string }>();
    const aliases = Object.prototype.hasOwnProperty.call(body, 'aliases')
      ? normalizeAliases(body.aliases, canonicalName)
      : existingAliases.results.map(item => item.alias);
    await assertIngredientNamesAvailable(env, canonicalName, aliases, ingredientId);
    const now = nextVersion(current.updatedAt);
    try {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE ingredient_catalog SET canonicalName = ?, category = ?, defaultUnit = ?, updatedAt = ?
          WHERE id = ? AND updatedAt = ?
        `).bind(canonicalName, category, unit, now, ingredientId, expectedUpdatedAt),
        env.DB.prepare('DELETE FROM ingredient_aliases WHERE ingredientId = ?').bind(ingredientId),
        ...aliases.map(alias => env.DB.prepare(`
          INSERT INTO ingredient_aliases (id, ingredientId, alias, createdAt) VALUES (?, ?, ?, ?)
        `).bind(crypto.randomUUID(), ingredientId, alias, now)),
        platformAuditInsert(env, context, 'platform.ingredient.updated', 'ingredient', ingredientId, {
          canonicalName,
        }, now),
      ]);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(409, 'INGREDIENT_NAME_CONFLICT', '食材名称或别名已存在');
      }
      throw error;
    }
    return json({ id: ingredientId, canonicalName, category, defaultUnit: unit, aliases, updatedAt: now });
  }));
}

async function listAudit(request: Request, env: Env): Promise<Response> {
  await requirePlatformAdmin(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const action = (url.searchParams.get('action') || '').trim().slice(0, 100);
  const actorUserId = (url.searchParams.get('actorUserId') || '').trim().slice(0, 100);
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));
  const conditions = ["ae.familyId IS NULL", "ae.action LIKE 'platform.%'"];
  const bindings: unknown[] = [];
  if (action) { conditions.push('ae.action = ?'); bindings.push(action); }
  if (actorUserId) { conditions.push('ae.actorUserId = ?'); bindings.push(actorUserId); }
  if (Number.isFinite(from) && from > 0) { conditions.push('ae.createdAt >= ?'); bindings.push(from); }
  if (Number.isFinite(to) && to > 0) { conditions.push('ae.createdAt <= ?'); bindings.push(to); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM audit_events ae WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT ae.id, ae.actorUserId, u.nickName AS actorName, ae.action, ae.targetType,
        ae.targetId, ae.details, ae.createdAt
      FROM audit_events ae LEFT JOIN users u ON u.id = ae.actorUserId
      WHERE ${where} ORDER BY ae.createdAt DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: rows.results.map(row => {
      const item = row as Record<string, unknown>;
      return { ...item, details: parseJsonField(item.details, null) };
    }),
    page,
    pageSize,
  });
}

export async function handlePlatformV2(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method === 'GET' && path === '/api/platform/status') {
    const status = await platformAdminStatus(request, env);
    return json({
      isPlatformAdmin: status.isPlatformAdmin,
      platformRole: status.platformRole,
      userId: status.auth.user.id,
    });
  }

  const assetMatch = path.match(/^\/api\/platform\/template-assets\/([^/]+)$/);
  if (assetMatch && request.method === 'GET') {
    return downloadPlatformAsset(request, env, decodeURIComponent(assetMatch[1]));
  }
  if (path === '/api/platform/overview' && request.method === 'GET') return overview(request, env);
  if (path === '/api/platform/users' && request.method === 'GET') return listUsers(request, env);
  if (path === '/api/platform/families' && request.method === 'GET') return listFamilies(request, env);
  if (path === '/api/platform/audit' && request.method === 'GET') return listAudit(request, env);
  if (path === '/api/platform/recipe-templates' && request.method === 'GET') return listTemplates(request, env);
  if (path === '/api/platform/recipe-templates' && request.method === 'POST') return createTemplate(request, env);
  if (path === '/api/platform/template-assets' && request.method === 'POST') return uploadTemplateAsset(request, env);
  if (path === '/api/platform/ingredients' && request.method === 'GET') return listIngredients(request, env);
  if (path === '/api/platform/ingredients' && request.method === 'POST') return createIngredient(request, env);

  const userMatch = path.match(/^\/api\/platform\/users\/([^/]+)(?:\/(revoke-sessions|suspend|restore))?$/);
  if (userMatch) {
    const userId = decodeURIComponent(userMatch[1]);
    if (!userMatch[2] && request.method === 'GET') return userDetail(request, env, userId);
    if (userMatch[2] === 'revoke-sessions' && request.method === 'POST') return revokeSessions(request, env, userId);
    if (userMatch[2] === 'suspend' && request.method === 'POST') return suspendUser(request, env, userId);
    if (userMatch[2] === 'restore' && request.method === 'POST') return restoreUser(request, env, userId);
  }

  const templateMatch = path.match(/^\/api\/platform\/recipe-templates\/([^/]+)(?:\/(publish|archive))?$/);
  if (templateMatch) {
    const templateId = decodeURIComponent(templateMatch[1]);
    if (!templateMatch[2] && request.method === 'GET') return getTemplate(request, env, templateId);
    if (!templateMatch[2] && request.method === 'PUT') return updateTemplate(request, env, templateId);
    if (templateMatch[2] === 'publish' && request.method === 'POST') return setTemplateStatus(request, env, templateId, 'active');
    if (templateMatch[2] === 'archive' && request.method === 'POST') return setTemplateStatus(request, env, templateId, 'archived');
  }
  if (assetMatch && request.method === 'DELETE') return deleteTemplateAsset(request, env, decodeURIComponent(assetMatch[1]));

  const ingredientMatch = path.match(/^\/api\/platform\/ingredients\/([^/]+)$/);
  if (ingredientMatch && request.method === 'PUT') {
    return updateIngredient(request, env, decodeURIComponent(ingredientMatch[1]));
  }
  throw new ApiError(404, 'NOT_FOUND', '接口不存在');
}
