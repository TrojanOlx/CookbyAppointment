import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { normalizeIngredientName, normalizeQuantity, parseQuantityText } from '../core/domain';
import { ApiError, json, pagination, readJson, requiredString } from '../core/http';
import { withOperationLock } from '../core/operationLock';
import type { Env } from '../core/types';
import { claimFamilyImages, expireDetachedTargetFiles, expireTargetFiles } from '../core/uploadSecurity';
import { strictAmountText, strictQuantity, strictText, validateSearchText } from '../core/validation';

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
  expectedUpdateTime?: unknown;
}

function dateInTimezone(date: Date, timezone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  }
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function withFamilyInventoryLock<T>(env: Env, familyId: string, execute: () => Promise<T>): Promise<T> {
  return withOperationLock(env, `family:${familyId}:inventory`, execute);
}

function quantityFields(data: InventoryInput): { quantity: number | null; unit: string | null; legacyAmount: string | null; amount: string } {
  if (Object.prototype.hasOwnProperty.call(data, 'amount')) {
    const amount = strictAmountText(data.amount);
    const parsed = parseQuantityText(amount);
    if (parsed) return { ...parsed, legacyAmount: null, amount };
    return { quantity: null, unit: null, legacyAmount: amount, amount };
  }
  const quantity = typeof data.quantity === 'number' ? strictQuantity(data.quantity) : null;
  const unit = typeof data.unit === 'string' && data.unit.trim() ? strictText(data.unit, '单位', 10, { required: true }) : null;
  if ((quantity === null) !== (unit === null)) {
    throw new ApiError(400, 'INVALID_QUANTITY', '结构化数量必须同时包含 quantity 和 unit');
  }
  if (quantity !== null && unit !== null && !normalizeQuantity(quantity, unit)) {
    const amount = `${quantity}${unit}`;
    return { quantity: null, unit: null, legacyAmount: amount, amount };
  }
  if (quantity === null) throw new ApiError(400, 'INVALID_QUANTITY', '请填写数量，无法换算时可填写“适量”等说明');
  return { quantity, unit, legacyAmount: null, amount: `${quantity}${unit}` };
}

async function resolveIngredientId(env: Env, name: string, requestedId?: unknown): Promise<string> {
  const normalized = normalizeIngredientName(name);
  if (typeof requestedId === 'string' && requestedId) {
    const requested = await env.DB.prepare(`
      SELECT c.id, c.canonicalName, group_concat(a.alias, '|') AS aliases
      FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
      WHERE c.id = ? GROUP BY c.id
    `).bind(requestedId).first<{ id: string; canonicalName: string; aliases: string | null }>();
    const names = requested ? [requested.canonicalName, ...(requested.aliases || '').split('|')] : [];
    if (requested && names.some(value => value && normalizeIngredientName(value) === normalized)) return requested.id;
  }
  const existing = await env.DB.prepare(`
    SELECT c.id FROM ingredient_catalog c
    LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
    WHERE c.canonicalName = ? OR a.alias = ?
      OR lower(replace(replace(replace(replace(replace(c.canonicalName, ' ', ''), '_', ''), '-', ''), '·', ''), '・', '')) = ?
      OR lower(replace(replace(replace(replace(replace(a.alias, ' ', ''), '_', ''), '-', ''), '·', ''), '・', '')) = ?
    LIMIT 1
  `).bind(name, name, normalized, normalized).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO ingredient_catalog (id, canonicalName, category, createdAt, updatedAt)
    VALUES (?, ?, '其他', ?, ?)
  `).bind(id, name, now, now).run();
  const created = await env.DB.prepare('SELECT id FROM ingredient_catalog WHERE canonicalName = ?')
    .bind(name).first<{ id: string }>();
  if (!created) throw new ApiError(500, 'INGREDIENT_RESOLUTION_FAILED', '食材目录写入失败');
  return created.id;
}

async function listInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const paginationResult = pagination(url);
  const page = paginationResult.page;
  const pageSize = Math.min(50, paginationResult.pageSize);
  const offset = (page - 1) * pageSize;
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const keyword = validateSearchText(url.searchParams.get('keyword'));
  const expiryState = url.searchParams.get('expiryState');
  if (expiryState && !['normal', 'expiring', 'expired'].includes(expiryState)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '库存过期状态无效');
  }
  const parsedExpiringDays = Number.parseInt(url.searchParams.get('expiringDays') || '3', 10);
  const expiringDays = Number.isFinite(parsedExpiringDays)
    ? Math.min(30, Math.max(0, parsedExpiringDays))
    : 3;
  const today = dateInTimezone(new Date(), context.timezone);
  const expiringUntil = new Date(`${today}T00:00:00Z`);
  expiringUntil.setUTCDate(expiringUntil.getUTCDate() + expiringDays);
  const expiringUntilText = expiringUntil.toISOString().slice(0, 10);
  const baseConditions = ['familyId = ?'];
  const baseBindings: unknown[] = [context.familyId];
  if (category) { baseConditions.push('category = ?'); baseBindings.push(category); }
  if (status) { baseConditions.push('status = ?'); baseBindings.push(status); }
  if (keyword) {
    baseConditions.push("name LIKE ? ESCAPE '\\'");
    baseBindings.push(`%${keyword.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const filteredConditions = [...baseConditions];
  const filteredBindings = [...baseBindings];
  if (expiryState === 'normal') {
    filteredConditions.push("(expiryDate IS NULL OR expiryDate = '' OR expiryDate > ?)");
    filteredBindings.push(expiringUntilText);
  } else if (expiryState === 'expiring') {
    filteredConditions.push("(expiryDate IS NOT NULL AND expiryDate != '' AND expiryDate >= ? AND expiryDate <= ?)");
    filteredBindings.push(today, expiringUntilText);
  } else if (expiryState === 'expired') {
    filteredConditions.push("(expiryDate IS NOT NULL AND expiryDate != '' AND expiryDate < ?)");
    filteredBindings.push(today);
  }
  const baseWhere = baseConditions.join(' AND ');
  const filteredWhere = filteredConditions.join(' AND ');
  const [count, summary, items] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM inventory_items WHERE ${filteredWhere}`).bind(...filteredBindings),
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN expiryDate IS NULL OR expiryDate = '' OR expiryDate > ? THEN 1 ELSE 0 END) AS normal,
        SUM(CASE WHEN expiryDate IS NOT NULL AND expiryDate != '' AND expiryDate >= ? AND expiryDate <= ? THEN 1 ELSE 0 END) AS expiring,
        SUM(CASE WHEN expiryDate IS NOT NULL AND expiryDate != '' AND expiryDate < ? THEN 1 ELSE 0 END) AS expired
      FROM inventory_items WHERE ${baseWhere}
    `).bind(expiringUntilText, today, expiringUntilText, today, ...baseBindings),
    env.DB.prepare(`SELECT * FROM inventory_items WHERE ${filteredWhere} ORDER BY expiryDate IS NULL, expiryDate ASC, createTime DESC LIMIT ? OFFSET ?`)
      .bind(...filteredBindings, pageSize, offset),
  ]);
  const total = Number((count.results[0] as { total?: unknown } | undefined)?.total || 0);
  const summaryRow = summary.results[0] as Record<string, unknown> | undefined;
  return json({
    total,
    list: items.results,
    page,
    pageSize,
    hasMore: offset + items.results.length < total,
    summary: {
      total: Number(summaryRow?.total || 0),
      normal: Number(summaryRow?.normal || 0),
      expiring: Number(summaryRow?.expiring || 0),
      expired: Number(summaryRow?.expired || 0),
    },
  });
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
  const name = strictText(data.name, '食材名称', 30, { required: true, meaningfulName: true });
  const quantity = quantityFields(data);
  const ingredientId = await resolveIngredientId(env, name, data.ingredientId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const item = {
    id, familyId: context.familyId, userId: context.user.id, openid: context.user.openid,
    name, amount: quantity.amount, quantity: quantity.quantity, unit: quantity.unit,
    legacyAmount: quantity.legacyAmount,
    ingredientId,
    category: strictText(data.category || '其他', '分类', 20, { required: true }),
    status: strictText(data.status || '正常', '状态', 20, { required: true }),
    putInDate: strictText(data.putInDate, '放入日期', 10), expiryDate: strictText(data.expiryDate, '到期日期', 10),
    image: strictText(data.image, '图片', 1000), remarks: strictText(data.remarks, '备注', 300, { allowNewlines: true }),
    createTime: now, updateTime: now,
  };
  return withFamilyInventoryLock(env, context.familyId, async () => {
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
    try {
      if (item.image) await claimFamilyImages(env, context, [item.image], 'inventory', id, 1);
    } catch (error) {
      await env.DB.prepare('DELETE FROM inventory_items WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
      throw error;
    }
    await writeAudit(env, context, 'inventory.created', 'inventory', id, { name });
    return json(item, 201);
  });
}

async function updateInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.write');
  const data = await readJson<InventoryInput>(request);
  const id = requiredString(data.id, '库存ID');
  return withFamilyInventoryLock(env, context.familyId, async () => {
    const current = await env.DB.prepare('SELECT * FROM inventory_items WHERE id = ? AND familyId = ?')
      .bind(id, context.familyId).first<Record<string, unknown>>();
    if (!current) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在');
    const currentUpdateTime = Number(current.updateTime);
    const expectedUpdateTime = data.expectedUpdateTime === undefined ? currentUpdateTime : Number(data.expectedUpdateTime);
    if (!Number.isFinite(expectedUpdateTime) || expectedUpdateTime < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', '库存版本无效');
    }
    if (expectedUpdateTime !== currentUpdateTime) {
      throw new ApiError(409, 'INVENTORY_CHANGED', '库存已被其他操作修改，请刷新后重试');
    }
    const hasAmount = Object.prototype.hasOwnProperty.call(data, 'amount');
    const hasStructuredQuantity = Object.prototype.hasOwnProperty.call(data, 'quantity')
      || Object.prototype.hasOwnProperty.call(data, 'unit');
    const amount = hasAmount
      ? quantityFields({ amount: data.amount })
      : hasStructuredQuantity
        ? quantityFields({
          quantity: data.quantity === undefined ? current.quantity : data.quantity,
          unit: data.unit === undefined ? current.unit : data.unit,
        })
        : {
          quantity: typeof current.quantity === 'number' ? current.quantity : null,
          unit: typeof current.unit === 'string' && current.unit ? current.unit : null,
          legacyAmount: typeof current.legacyAmount === 'string' && current.legacyAmount ? current.legacyAmount : null,
          amount: typeof current.amount === 'string' ? current.amount : '',
        };
    const nextName = data.name === undefined
      ? String(current.name)
      : strictText(data.name, '食材名称', 30, { required: true, meaningfulName: true });
    const ingredientId = await resolveIngredientId(
      env,
      nextName,
      data.ingredientId === undefined ? current.ingredientId : data.ingredientId,
    );
    const next = {
      name: nextName,
      ingredientId,
      category: data.category === undefined ? current.category : strictText(data.category, '分类', 20, { required: true }),
      status: data.status === undefined ? current.status : strictText(data.status, '状态', 20, { required: true }),
      putInDate: data.putInDate === undefined ? current.putInDate : strictText(data.putInDate, '放入日期', 10),
      expiryDate: data.expiryDate === undefined ? current.expiryDate : strictText(data.expiryDate, '到期日期', 10),
      image: data.image === undefined ? current.image : strictText(data.image, '图片', 1000),
      remarks: data.remarks === undefined ? current.remarks : strictText(data.remarks, '备注', 300, { allowNewlines: true }),
    };
    if (typeof next.image === 'string' && next.image) {
      await claimFamilyImages(env, context, [next.image], 'inventory', id, 1);
    }
    const updateTime = Math.max(Date.now(), currentUpdateTime + 1);
    const result = await env.DB.prepare(`
      UPDATE inventory_items SET name = ?, amount = ?, category = ?, status = ?, putInDate = ?, expiryDate = ?,
        image = ?, remarks = ?, updateTime = ?, ingredientId = ?, quantity = ?, unit = ?, legacyAmount = ?
      WHERE id = ? AND familyId = ? AND updateTime = ?
    `).bind(
      next.name, amount.amount, next.category, next.status, next.putInDate, next.expiryDate,
      next.image, next.remarks, updateTime, next.ingredientId, amount.quantity, amount.unit,
      amount.legacyAmount, id, context.familyId, expectedUpdateTime,
    ).run();
    if (!result.meta.changes) throw new ApiError(409, 'INVENTORY_CHANGED', '库存已被其他操作修改，请刷新后重试');
    if (data.image !== undefined) {
      await expireDetachedTargetFiles(
        env,
        context.familyId,
        'inventory',
        id,
        typeof next.image === 'string' && next.image ? [next.image] : [],
      );
    }
    await writeAudit(env, context, 'inventory.updated', 'inventory', id);
    return json({ ...current, ...next, ...amount, id, updateTime });
  });
}

async function deleteInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'inventory.delete');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少库存ID');
  return withFamilyInventoryLock(env, context.familyId, async () => {
    const result = await env.DB.prepare('DELETE FROM inventory_items WHERE id = ? AND familyId = ?')
      .bind(id, context.familyId).run();
    if (!result.meta.changes) throw new ApiError(404, 'INVENTORY_NOT_FOUND', '库存项不存在');
    await expireTargetFiles(env, context.familyId, 'inventory', id);
    await writeAudit(env, context, 'inventory.deleted', 'inventory', id);
    return json({ success: true });
  });
}

async function expiringInventory(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const days = Math.min(30, Math.max(0, Number.parseInt(new URL(request.url).searchParams.get('days') || '3', 10) || 3));
  const today = dateInTimezone(new Date(), context.timezone);
  const untilDate = new Date(`${today}T00:00:00Z`);
  untilDate.setUTCDate(untilDate.getUTCDate() + days);
  const until = untilDate.toISOString().slice(0, 10);
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
  return withFamilyInventoryLock(env, context.familyId, async () => {
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
  });
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
