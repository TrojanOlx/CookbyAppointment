import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { normalizeQuantity } from '../core/domain';
import { ApiError, json, optionalString, pagination, readJson, requiredString } from '../core/http';
import type { Env } from '../core/types';

interface InventoryInput {
  id?: unknown;
  name?: unknown;
  amount?: unknown;
  quantity?: unknown;
  unit?: unknown;
  ingredientId?: unknown;
  category?: unknown;
  status?: unknown;
  putInDate?: unknown;
  expiryDate?: unknown;
  image?: unknown;
  remarks?: unknown;
}

function quantityFields(data: InventoryInput): { quantity: number | null; unit: string | null; legacyAmount: string | null; amount: string } {
  const quantity = typeof data.quantity === 'number' && Number.isFinite(data.quantity) && data.quantity >= 0 ? data.quantity : null;
  const unit = typeof data.unit === 'string' && data.unit.trim() ? data.unit.trim().slice(0, 20) : null;
  if ((quantity === null) !== (unit === null)) {
    throw new ApiError(400, 'INVALID_QUANTITY', '结构化数量必须同时包含 quantity 和 unit');
  }
  if (quantity !== null && unit !== null && !normalizeQuantity(quantity, unit)) {
    return { quantity, unit, legacyAmount: typeof data.amount === 'string' ? data.amount : `${quantity}${unit}`, amount: typeof data.amount === 'string' ? data.amount : `${quantity}${unit}` };
  }
  const legacyAmount = typeof data.amount === 'string' && data.amount.trim() ? data.amount.trim().slice(0, 100) : null;
  if (quantity === null && !legacyAmount) throw new ApiError(400, 'INVALID_QUANTITY', '请填写数量，无法换算时可填写“适量”等说明');
  return { quantity, unit, legacyAmount, amount: legacyAmount || `${quantity}${unit}` };
}

async function listInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const keyword = url.searchParams.get('keyword');
  const conditions = ['familyId = ?'];
  const bindings: unknown[] = [context.familyId];
  if (category) { conditions.push('category = ?'); bindings.push(category); }
  if (status) { conditions.push('status = ?'); bindings.push(status); }
  if (keyword) { conditions.push('name LIKE ?'); bindings.push(`%${keyword}%`); }
  const where = conditions.join(' AND ');
  const [count, items] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM inventory_items WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`SELECT * FROM inventory_items WHERE ${where} ORDER BY expiryDate IS NULL, expiryDate ASC, createTime DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, offset),
  ]);
  return json({ total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0), list: items.results, page, pageSize });
}

async function getInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少库存ID');
  const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id = ? AND familyId = ?')
    .bind(id, context.familyId).first();
  if (!item) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在');
  return json(item);
}

async function addInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.write');
  const data = await readJson<InventoryInput>(request);
  const name = requiredString(data.name, '食材名称', 80);
  const quantity = quantityFields(data);
  const id = crypto.randomUUID();
  const now = Date.now();
  const item = {
    id, familyId: context.familyId, userId: context.user.id, openid: context.user.openid,
    name, amount: quantity.amount, quantity: quantity.quantity, unit: quantity.unit,
    legacyAmount: quantity.legacyAmount,
    ingredientId: optionalString(data.ingredientId, 100),
    category: optionalString(data.category, 40) || '其他', status: optionalString(data.status, 20) || '正常',
    putInDate: optionalString(data.putInDate, 20), expiryDate: optionalString(data.expiryDate, 20),
    image: optionalString(data.image, 1000), remarks: optionalString(data.remarks, 500) || '',
    createTime: now, updateTime: now,
  };
  await env.DB.prepare(`
    INSERT INTO inventory_items (
      id, userId, openid, name, amount, category, status, putInDate, expiryDate, image, remarks,
      createTime, updateTime, familyId, ingredientId, quantity, unit, legacyAmount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.id, item.userId, item.openid, item.name, item.amount, item.category, item.status,
    item.putInDate, item.expiryDate, item.image, item.remarks, now, now, item.familyId,
    item.ingredientId, item.quantity, item.unit, item.legacyAmount,
  ).run();
  await writeAudit(env, context, 'inventory.created', 'inventory', id, { name });
  return json(item, 201);
}

async function updateInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.write');
  const data = await readJson<InventoryInput>(request);
  const id = requiredString(data.id, '库存ID');
  const current = await env.DB.prepare('SELECT * FROM inventory_items WHERE id = ? AND familyId = ?')
    .bind(id, context.familyId).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在');
  const merged: InventoryInput = { ...current, ...data };
  const amount = quantityFields(merged);
  const next = {
    name: data.name === undefined ? String(current.name) : requiredString(data.name, '食材名称', 80),
    ingredientId: data.ingredientId === undefined ? current.ingredientId : optionalString(data.ingredientId, 100),
    category: data.category === undefined ? current.category : optionalString(data.category, 40) || '其他',
    status: data.status === undefined ? current.status : optionalString(data.status, 20) || '正常',
    putInDate: data.putInDate === undefined ? current.putInDate : optionalString(data.putInDate, 20),
    expiryDate: data.expiryDate === undefined ? current.expiryDate : optionalString(data.expiryDate, 20),
    image: data.image === undefined ? current.image : optionalString(data.image, 1000),
    remarks: data.remarks === undefined ? current.remarks : optionalString(data.remarks, 500) || '',
  };
  const updateTime = Date.now();
  await env.DB.prepare(`
    UPDATE inventory_items SET name = ?, amount = ?, category = ?, status = ?, putInDate = ?, expiryDate = ?,
      image = ?, remarks = ?, updateTime = ?, ingredientId = ?, quantity = ?, unit = ?, legacyAmount = ?
    WHERE id = ? AND familyId = ?
  `).bind(
    next.name, amount.amount, next.category, next.status, next.putInDate, next.expiryDate,
    next.image, next.remarks, updateTime, next.ingredientId, amount.quantity, amount.unit,
    amount.legacyAmount, id, context.familyId,
  ).run();
  await writeAudit(env, context, 'inventory.updated', 'inventory', id);
  return json({ ...current, ...next, ...amount, id, updateTime });
}

async function deleteInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.delete');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少库存ID');
  const result = await env.DB.prepare('DELETE FROM inventory_items WHERE id = ? AND familyId = ?')
    .bind(id, context.familyId).run();
  if (!result.meta.changes) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在');
  await writeAudit(env, context, 'inventory.deleted', 'inventory', id);
  return json({ success: true });
}

async function expiringInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const days = Math.min(30, Math.max(0, Number.parseInt(new URL(request.url).searchParams.get('days') || '3', 10) || 3));
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const result = await env.DB.prepare(`
    SELECT * FROM inventory_items
    WHERE familyId = ? AND expiryDate IS NOT NULL AND expiryDate BETWEEN ? AND ?
    ORDER BY expiryDate ASC
  `).bind(context.familyId, today, until).all();
  return json({ list: result.results, days });
}

async function deductInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.delete');
  const body = await readJson<{ items?: Array<{ id?: unknown; quantity?: unknown }> }>(request);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请选择要扣减的库存');
  }
  const quantities = new Map<string, number>();
  for (const entry of body.items) {
    const id = requiredString(entry.id, '库存ID');
    const quantity = typeof entry.quantity === 'number' && Number.isFinite(entry.quantity) && entry.quantity > 0
      ? entry.quantity : null;
    if (quantity === null) throw new ApiError(400, 'INVALID_QUANTITY', '扣减数量必须大于0');
    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }
  const deductions = Array.from(quantities, ([id, quantity]) => ({ id, quantity }));
  const caseSql = deductions.map(() => 'WHEN id = ? THEN ?').join(' ');
  const placeholders = deductions.map(() => '?').join(',');
  const eligibleSql = deductions.map(() => '(eligible.id = ? AND eligible.quantity IS NOT NULL AND eligible.quantity >= ?)').join(' OR ');
  const caseBindings = deductions.flatMap(item => [item.id, item.quantity]);
  const eligibleBindings = deductions.flatMap(item => [item.id, item.quantity]);
  const updated = await env.DB.prepare(`
    UPDATE inventory_items
    SET quantity = quantity - CASE ${caseSql} ELSE 0 END,
      amount = CAST(quantity - CASE ${caseSql} ELSE 0 END AS TEXT) || COALESCE(unit, ''),
      updateTime = ?
    WHERE familyId = ? AND id IN (${placeholders})
      AND (
        SELECT COUNT(*) FROM inventory_items eligible
        WHERE eligible.familyId = ? AND (${eligibleSql})
      ) = ?
    RETURNING id
  `).bind(
    ...caseBindings, ...caseBindings, Date.now(), context.familyId,
    ...deductions.map(item => item.id), context.familyId, ...eligibleBindings, deductions.length,
  ).all<{ id: string }>();
  if (updated.results.length !== deductions.length) {
    const current = await env.DB.prepare(`
      SELECT id, quantity FROM inventory_items WHERE familyId = ? AND id IN (${placeholders})
    `).bind(context.familyId, ...deductions.map(item => item.id)).all<{ id: string; quantity: number | null }>();
    const byId = new Map(current.results.map(item => [item.id, item.quantity]));
    for (const deduction of deductions) {
      if (!byId.has(deduction.id)) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在', { id: deduction.id });
      const available = byId.get(deduction.id);
      if (available === undefined) throw new ApiError(409, 'INVENTORY_CHANGED', '库存已变化，请刷新后重试');
      if (available === null) throw new ApiError(409, 'QUANTITY_NOT_CONVERTIBLE', '该库存仅有文字数量，不能自动扣减', { id: deduction.id });
      if (available < deduction.quantity) {
        throw new ApiError(409, 'INVENTORY_INSUFFICIENT', '库存不足', {
          id: deduction.id, available, requested: deduction.quantity,
        });
      }
    }
    throw new ApiError(409, 'INVENTORY_CHANGED', '库存已变化，请刷新后重试');
  }
  await writeAudit(env, context, 'inventory.bulk_deducted', 'inventory', undefined, { items: deductions });
  return json({ success: true });
}

export async function handleInventoryV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/inventory/list':
    case 'GET /api/inventory/search': return listInventory(request, env);
    case 'GET /api/inventory/detail': return getInventory(request, env);
    case 'POST /api/inventory/add': return addInventory(request, env);
    case 'PUT /api/inventory/update': return updateInventory(request, env);
    case 'DELETE /api/inventory/delete': return deleteInventory(request, env);
    case 'GET /api/inventory/expiring': return expiringInventory(request, env);
    case 'POST /api/inventory/deduct': return deductInventory(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
