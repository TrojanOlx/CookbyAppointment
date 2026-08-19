import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { normalizeIngredientName, normalizeQuantity } from '../core/domain';
import { ApiError, json, readJson, requiredString } from '../core/http';
import { withOperationLock } from '../core/operationLock';
import { withFamilyInventoryLock } from './inventoryV2Handler';
import type { Env, FamilyContext } from '../core/types';

interface Requirement {
  key: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  legacyAmount: string | null;
  sources: Map<string, { quantity: number | null; unit: string | null }>;
}

async function activeListId(env: Env, familyId: string, actorId: string): Promise<string> {
  const existing = await env.DB.prepare(`SELECT id FROM shopping_lists WHERE familyId = ? AND status = 'active' LIMIT 1`)
    .bind(familyId).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO shopping_lists (id, familyId, status, createdAt, updatedAt) VALUES (?, ?, 'active', ?, ?)`)
    .bind(id, familyId, now, now).run();
  const active = await env.DB.prepare(`SELECT id FROM shopping_lists WHERE familyId = ? AND status = 'active' LIMIT 1`)
    .bind(familyId).first<{ id: string }>();
  if (!active) throw new ApiError(500, 'SHOPPING_LIST_CREATE_FAILED', '采购清单创建失败');
  void actorId;
  return active.id;
}

export function withFamilyShoppingLock<T>(env: Env, familyId: string, execute: () => Promise<T>): Promise<T> {
  return withOperationLock(env, `family:${familyId}:shopping`, execute);
}

export async function recalculateFamilyShoppingWithinLock(
  env: Env,
  context: FamilyContext,
): Promise<{ itemCount: number }> {
  const listId = await activeListId(env, context.familyId, context.user.id);
  const [ingredientRows, inventoryRows] = await env.DB.batch([
    env.DB.prepare(`
      SELECT a.id AS appointmentId, i.ingredientId, i.name, i.quantity, i.unit, i.amount, i.legacyAmount
      FROM appointments a
      JOIN appointment_dishes ad ON ad.appointmentId = a.id
      JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId
      JOIN ingredients i ON i.dishId = d.id
      WHERE a.familyId = ? AND a.status IN ('已确认', 'confirmed')
    `).bind(context.familyId),
    env.DB.prepare(`
      SELECT id, ingredientId, name, quantity, unit, amount, legacyAmount
      FROM inventory_items WHERE familyId = ? AND status NOT IN ('已用完', 'discarded')
    `).bind(context.familyId),
  ]);

  const ingredientResults = ingredientRows.results as Array<Record<string, unknown>>;
  const ingredientIdsByName = new Map<string, Set<string>>();
  for (const row of ingredientResults) {
    if (typeof row.ingredientId !== 'string' || typeof row.name !== 'string') continue;
    const normalizedName = normalizeIngredientName(row.name);
    const ids = ingredientIdsByName.get(normalizedName) || new Set<string>();
    ids.add(row.ingredientId);
    ingredientIdsByName.set(normalizedName, ids);
  }

  const requirements = new Map<string, Requirement>();
  for (const row of ingredientResults) {
    const normalized = normalizeQuantity(row.quantity, row.unit);
    const name = typeof row.name === 'string' ? row.name : '';
    const normalizedName = normalizeIngredientName(name);
    const matchingIds = ingredientIdsByName.get(normalizedName);
    const ingredientId = typeof row.ingredientId === 'string'
      ? row.ingredientId
      : matchingIds?.size === 1 ? Array.from(matchingIds)[0] : null;
    const legacyAmount = typeof row.legacyAmount === 'string'
      ? row.legacyAmount : typeof row.amount === 'string' ? row.amount : '适量';
    const identity = ingredientId ? `id:${ingredientId}` : `name:${normalizedName}`;
    const key = normalized ? `${identity}:${normalized.dimension}` : `${identity}:text:${legacyAmount}`;
    let requirement = requirements.get(key);
    if (!requirement) {
      requirement = {
        key,
        ingredientId,
        name,
        quantity: normalized ? 0 : null,
        unit: normalized?.unit || null,
        legacyAmount: normalized ? null : legacyAmount,
        sources: new Map(),
      };
      requirements.set(key, requirement);
    }
    if (normalized && requirement.quantity !== null) requirement.quantity += normalized.quantity;
    const source = requirement.sources.get(String(row.appointmentId)) || { quantity: normalized ? 0 : null, unit: normalized?.unit || null };
    if (normalized && source.quantity !== null) source.quantity += normalized.quantity;
    requirement.sources.set(String(row.appointmentId), source);
  }

  const inventory = (inventoryRows.results as Array<Record<string, unknown>>).map((row, index) => ({
    index,
    row,
    normalized: normalizeQuantity(row.quantity, row.unit),
  }));
  const remainingInventory = new Map<number, number>();
  for (const item of inventory) {
    if (item.normalized) remainingInventory.set(item.index, item.normalized.quantity);
  }

  for (const requirement of requirements.values()) {
    const matches = (row: Record<string, unknown>): boolean =>
      Boolean(requirement.ingredientId && row.ingredientId === requirement.ingredientId)
      || normalizeIngredientName(String(row.name)) === normalizeIngredientName(requirement.name);
    if (requirement.quantity === null) {
      const present = inventory.some(item => matches(item.row)
        && (!item.normalized || (remainingInventory.get(item.index) || 0) > 0));
      if (present) requirement.quantity = 0;
      continue;
    }
    let missing = requirement.quantity;
    for (const item of inventory) {
      if (!matches(item.row) || !item.normalized || item.normalized.unit !== requirement.unit) continue;
      const available = remainingInventory.get(item.index) || 0;
      const consumed = Math.min(missing, available);
      missing -= consumed;
      remainingInventory.set(item.index, available - consumed);
      if (missing <= 0) break;
    }
    requirement.quantity = Math.max(0, missing);
  }

  const needed = Array.from(requirements.values()).filter(item => item.quantity === null || item.quantity > 0);
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      DELETE FROM shopping_item_sources
      WHERE itemId IN (
        SELECT id FROM shopping_list_items
        WHERE shoppingListId = ? AND sourceType = 'appointment' AND checked = 0 AND purchasedAt IS NULL
      )
    `).bind(listId),
    env.DB.prepare(`
      DELETE FROM shopping_list_items
      WHERE shoppingListId = ? AND sourceType = 'appointment' AND checked = 0 AND purchasedAt IS NULL
    `).bind(listId),
  ];
  for (const requirement of needed) {
    const itemId = crypto.randomUUID();
    statements.push(env.DB.prepare(`
      INSERT INTO shopping_list_items (
        id, shoppingListId, ingredientId, name, quantity, unit, legacyAmount, sourceType,
        createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'appointment', ?, ?, ?)
    `).bind(
      itemId, listId, requirement.ingredientId, requirement.name, requirement.quantity,
      requirement.unit, requirement.legacyAmount, context.user.id, now, now,
    ));
    for (const [appointmentId, source] of requirement.sources) {
      statements.push(env.DB.prepare(`
        INSERT INTO shopping_item_sources (itemId, appointmentId, requiredQuantity, unit, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).bind(itemId, appointmentId, source.quantity, source.unit, now));
    }
  }
  statements.push(env.DB.prepare('UPDATE shopping_lists SET updatedAt = ? WHERE id = ?').bind(now, listId));
  await env.DB.batch(statements);
  return { itemCount: needed.length };
}

export async function recalculateFamilyShopping(env: Env, context: FamilyContext): Promise<{ itemCount: number }> {
  return withFamilyShoppingLock(env, context.familyId, () => recalculateFamilyShoppingWithinLock(env, context));
}

async function listShopping(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const listId = await activeListId(env, context.familyId, context.user.id);
  const result = await env.DB.prepare(`
    SELECT i.*, u.nickName AS assigneeName,
      group_concat(DISTINCT s.appointmentId) AS appointmentIds
    FROM shopping_list_items i
    LEFT JOIN users u ON u.id = i.assigneeId
    LEFT JOIN shopping_item_sources s ON s.itemId = i.id
    WHERE i.shoppingListId = ?
    GROUP BY i.id
    ORDER BY i.checked ASC, i.createdAt DESC
  `).bind(listId).all<Record<string, unknown>>();
  const items = result.results.map(item => ({
    ...item,
    checked: Boolean(item.checked),
    appointmentIds: typeof item.appointmentIds === 'string' && item.appointmentIds ? item.appointmentIds.split(',') : [],
  }));
  return json({ id: listId, familyId: context.familyId, familyName: context.familyName, status: 'active', items });
}

async function addItem(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'shopping.write');
  const body = await readJson<Record<string, unknown>>(request);
  const listId = await activeListId(env, context.familyId, context.user.id);
  const id = crypto.randomUUID();
  const name = requiredString(body.name, '采购项名称', 80);
  const quantity = typeof body.quantity === 'number' && body.quantity >= 0 ? body.quantity : null;
  const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim().slice(0, 20) : null;
  if ((quantity === null) !== (unit === null)) throw new ApiError(400, 'INVALID_QUANTITY', 'quantity 和 unit 必须同时提供');
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO shopping_list_items (
      id, shoppingListId, ingredientId, name, quantity, unit, legacyAmount, sourceType,
      createdBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)
  `).bind(
    id, listId, typeof body.ingredientId === 'string' ? body.ingredientId : null,
    name, quantity, unit, typeof body.note === 'string' ? body.note.slice(0, 200) : null,
    context.user.id, now, now,
  ).run();
  await writeAudit(env, context, 'shopping.item_created', 'shopping_item', id, { name });
  return json({ id, name, quantity, unit, sourceType: 'manual', checked: false, createdAt: now }, 201);
}

async function updateItem(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'shopping.write');
  const body = await readJson<Record<string, unknown>>(request);
  const id = requiredString(body.id, '采购项ID');
  return withFamilyShoppingLock(env, context.familyId, async () => {
    const current = await env.DB.prepare(`
      SELECT i.* FROM shopping_list_items i JOIN shopping_lists l ON l.id = i.shoppingListId
      WHERE i.id = ? AND l.familyId = ? AND l.status = 'active'
    `).bind(id, context.familyId).first<Record<string, unknown>>();
    if (!current) throw new ApiError(404, 'SHOPPING_ITEM_NOT_FOUND', '采购项不存在');
    const expectedUpdatedAt = body.expectedUpdatedAt === undefined
      ? Number(current.updatedAt)
      : typeof body.expectedUpdatedAt === 'number' && Number.isFinite(body.expectedUpdatedAt)
        ? body.expectedUpdatedAt
        : null;
    if (expectedUpdatedAt === null) throw new ApiError(400, 'VALIDATION_ERROR', '采购项版本格式错误');
    let assigneeId = current.assigneeId;
    if (body.assigneeId !== undefined) {
      assigneeId = typeof body.assigneeId === 'string' && body.assigneeId ? body.assigneeId : null;
      if (assigneeId) {
        const member = await env.DB.prepare(`SELECT 1 FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
          .bind(context.familyId, assigneeId).first();
        if (!member) throw new ApiError(400, 'ASSIGNEE_NOT_MEMBER', '采购人不是当前家庭成员');
      }
    }
    const checked = body.checked === undefined ? Number(current.checked) : body.checked ? 1 : 0;
    const purchasedAt = checked ? Number(current.purchasedAt || Date.now()) : null;
    const quantity = typeof body.quantity === 'number' && Number.isFinite(body.quantity) && body.quantity >= 0 ? body.quantity : current.quantity;
    const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim().slice(0, 20) : current.unit;
    const now = Math.max(Date.now(), Number(current.updatedAt) + 1);
    const updated = await env.DB.prepare(`
      UPDATE shopping_list_items SET quantity = ?, unit = ?, assigneeId = ?, checked = ?, purchasedAt = ?, updatedAt = ?
      WHERE id = ? AND updatedAt = ?
    `).bind(quantity, unit, assigneeId, checked, purchasedAt, now, id, expectedUpdatedAt).run();
    if (!updated.meta.changes) throw new ApiError(409, 'SHOPPING_ITEM_CHANGED', '采购项已变化，请刷新后重试');
    await writeAudit(env, context, checked ? 'shopping.item_purchased' : 'shopping.item_updated', 'shopping_item', id);
    return json({ ...current, id, quantity, unit, assigneeId, checked: Boolean(checked), purchasedAt, updatedAt: now });
  });
}

async function deleteItem(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'shopping.write');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少采购项ID');
  return withFamilyShoppingLock(env, context.familyId, async () => {
    const item = await env.DB.prepare(`
      SELECT i.sourceType, i.checked FROM shopping_list_items i JOIN shopping_lists l ON l.id = i.shoppingListId
      WHERE i.id = ? AND l.familyId = ?
    `).bind(id, context.familyId).first<{ sourceType: string; checked: number }>();
    if (!item) throw new ApiError(404, 'SHOPPING_ITEM_NOT_FOUND', '采购项不存在');
    if (item.sourceType !== 'manual' || item.checked) throw new ApiError(409, 'SHOPPING_ITEM_PROTECTED', '自动生成或已购项目不能手工删除');
    const deleted = await env.DB.prepare(`
      DELETE FROM shopping_list_items WHERE id = ? AND sourceType = 'manual' AND checked = 0
    `).bind(id).run();
    if (!deleted.meta.changes) throw new ApiError(409, 'SHOPPING_ITEM_CHANGED', '采购项已变化，请刷新后重试');
    await writeAudit(env, context, 'shopping.item_deleted', 'shopping_item', id);
    return json({ success: true });
  });
}

async function recalculate(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'appointment.manage');
  const result = await recalculateFamilyShopping(env, context);
  await writeAudit(env, context, 'shopping.recalculated', 'shopping_list', undefined, result);
  return json({ success: true, ...result });
}

async function stockIn(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.write');
  const body = await readJson<{ itemIds?: unknown }>(request);
  if (!Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.length > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请选择已购采购项');
  }
  const itemIds = Array.from(new Set(body.itemIds.filter((id): id is string => typeof id === 'string')));
  return withFamilyShoppingLock(env, context.familyId, () =>
    withFamilyInventoryLock(env, context.familyId, async () => {
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT i.* FROM shopping_list_items i JOIN shopping_lists l ON l.id = i.shoppingListId
      WHERE l.familyId = ? AND i.id IN (${placeholders}) AND i.checked = 1 AND i.stockedAt IS NULL
    `).bind(context.familyId, ...itemIds).all<Record<string, unknown>>();
    if (rows.results.length !== itemIds.length) throw new ApiError(409, 'SHOPPING_ITEM_NOT_STOCKABLE', '部分采购项未购买、已入库或不属于当前家庭');
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const statements: D1PreparedStatement[] = [];
    for (const item of rows.results) {
      const inventoryId = crypto.randomUUID();
      const amount = item.quantity === null
        ? (typeof item.legacyAmount === 'string' ? item.legacyAmount : '适量')
        : `${typeof item.quantity === 'number' ? item.quantity : ''}${typeof item.unit === 'string' ? item.unit : ''}`;
      statements.push(env.DB.prepare(`
        INSERT INTO inventory_items (
          id, userId, openid, name, amount, category, status, putInDate, remarks,
          createTime, updateTime, familyId, ingredientId, quantity, unit, legacyAmount, sourceShoppingItemId
        ) VALUES (?, ?, ?, ?, ?, '其他', '正常', ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        inventoryId, context.user.id, context.user.openid, item.name, amount, today,
        now, now, context.familyId, item.ingredientId, item.quantity, item.unit, item.legacyAmount, item.id,
      ));
      statements.push(env.DB.prepare(`
        UPDATE shopping_list_items SET stockedAt = ?, updatedAt = ?
        WHERE id = ? AND stockedAt IS NULL
      `).bind(now, now, item.id));
    }
    try {
      const results = await env.DB.batch(statements);
      if (results.some((result, index) => index % 2 === 1 && !result.meta.changes)) {
        throw new ApiError(409, 'SHOPPING_ITEM_NOT_STOCKABLE', '采购项已入库，请刷新后重试');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('sourceShoppingItemId')) {
        throw new ApiError(409, 'SHOPPING_ITEM_NOT_STOCKABLE', '采购项已入库，请刷新后重试');
      }
      throw error;
    }
      await writeAudit(env, context, 'shopping.stocked_in', 'shopping_item', undefined, { itemIds });
      return json({ success: true, stockedCount: itemIds.length });
    }));
}

export async function handleShoppingV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/shopping/list': return listShopping(request, env);
    case 'POST /api/shopping/item': return addItem(request, env);
    case 'PUT /api/shopping/item': return updateItem(request, env);
    case 'DELETE /api/shopping/item': return deleteItem(request, env);
    case 'POST /api/shopping/recalculate': return recalculate(request, env);
    case 'POST /api/shopping/stock-in': return stockIn(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
