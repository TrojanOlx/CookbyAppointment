import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { collectPreferenceWarnings, compareRecommendations, normalizeIngredientName, normalizeQuantity } from '../core/domain';
import { ApiError, json, pagination, parseJsonField, readJson, requiredString } from '../core/http';
import type { Env, FamilyContext } from '../core/types';

interface IngredientInput {
  id?: unknown;
  name?: unknown;
  amount?: unknown;
  ingredientId?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

interface DishInput {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  spicy?: unknown;
  images?: unknown;
  steps?: unknown;
  notice?: unknown;
  remark?: unknown;
  reference?: unknown;
  ingredients?: unknown;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (value === undefined || value === null || value === '') return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = [value]; }
  }
  if (!Array.isArray(parsed)) throw new ApiError(400, 'VALIDATION_ERROR', '数组字段格式错误');
  return parsed.slice(0, maxItems).map(item => requiredString(item, '数组项', maxLength));
}

function mapDish(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, images: parseJsonField(row.images, []), steps: parseJsonField(row.steps, []) };
}

async function resolveCatalog(env: Env, name: string, requestedId?: unknown): Promise<string> {
  if (typeof requestedId === 'string' && requestedId) {
    const catalog = await env.DB.prepare('SELECT id FROM ingredient_catalog WHERE id = ?').bind(requestedId).first();
    if (!catalog) throw new ApiError(400, 'INGREDIENT_NOT_FOUND', '标准食材不存在', { ingredientId: requestedId });
    return requestedId;
  }
  const normalized = normalizeIngredientName(name);
  const existing = await env.DB.prepare(`
    SELECT c.id FROM ingredient_catalog c
    LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
    WHERE lower(replace(c.canonicalName, ' ', '')) = ? OR lower(replace(a.alias, ' ', '')) = ? LIMIT 1
  `).bind(normalized, normalized).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ingredient_catalog (id, canonicalName, category, createdAt, updatedAt)
    VALUES (?, ?, '其他', ?, ?)
  `).bind(id, name, now, now).run();
  return id;
}

async function normalizeIngredient(env: Env, input: IngredientInput): Promise<{
  id: string; name: string; ingredientId: string; quantity: number | null; unit: string | null; amount: string; legacyAmount: string | null;
}> {
  const name = requiredString(input.name, '食材名称', 80);
  const ingredientId = await resolveCatalog(env, name, input.ingredientId);
  const quantity = typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 0 ? input.quantity : null;
  const unit = typeof input.unit === 'string' && input.unit.trim() ? input.unit.trim().slice(0, 20) : null;
  if ((quantity === null) !== (unit === null)) throw new ApiError(400, 'INVALID_QUANTITY', '食材 quantity 和 unit 必须同时提供');
  const legacyAmount = typeof input.amount === 'string' && input.amount.trim() ? input.amount.trim().slice(0, 100) : null;
  if (quantity === null && !legacyAmount) throw new ApiError(400, 'INVALID_QUANTITY', '食材必须提供结构化数量或文字用量');
  return {
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    name, ingredientId, quantity, unit,
    amount: legacyAmount || `${quantity}${unit}`,
    legacyAmount: legacyAmount || (quantity !== null && unit && !normalizeQuantity(quantity, unit) ? `${quantity}${unit}` : null),
  };
}

async function listDishes(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const type = url.searchParams.get('type');
  const keyword = url.searchParams.get('keyword');
  const conditions = ['familyId = ?'];
  const bindings: unknown[] = [context.familyId];
  if (type) { conditions.push('type = ?'); bindings.push(type); }
  if (keyword) { conditions.push('name LIKE ?'); bindings.push(`%${keyword}%`); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM dishes WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`SELECT * FROM dishes WHERE ${where} ORDER BY createTime DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: (rows.results as Array<Record<string, unknown>>).map(row => mapDish(row)), page, pageSize,
  });
}

async function getDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少菜品ID');
  const dish = await env.DB.prepare('SELECT * FROM dishes WHERE id = ? AND familyId = ?')
    .bind(id, context.familyId).first<Record<string, unknown>>();
  if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const ingredients = await env.DB.prepare('SELECT * FROM ingredients WHERE dishId = ? ORDER BY createTime ASC')
    .bind(id).all();
  return json({ ...mapDish(dish), ingredients: ingredients.results });
}

async function insertIngredients(env: Env, dishId: string, inputs: IngredientInput[], now: number): Promise<void> {
  const normalized = [];
  for (const input of inputs) normalized.push(await normalizeIngredient(env, input));
  if (!normalized.length) return;
  await env.DB.batch(normalized.map(item => env.DB.prepare(`
    INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, dishId, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount)));
}

function parseIngredientInputs(value: unknown): IngredientInput[] {
  if (value === undefined || value === null) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw new ApiError(400, 'VALIDATION_ERROR', '食材列表格式错误'); }
  }
  if (!Array.isArray(parsed) || parsed.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', '食材列表格式错误');
  return parsed as IngredientInput[];
}

async function addDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const data = await readJson<DishInput>(request, 256 * 1024);
  const id = crypto.randomUUID();
  const now = Date.now();
  const dish = {
    id, name: requiredString(data.name, '菜品名称', 80), type: requiredString(data.type, '菜品类型', 40),
    spicy: typeof data.spicy === 'string' && data.spicy.trim() ? data.spicy.trim().slice(0, 20) : '不辣',
    images: stringList(data.images, 20, 1000), steps: stringList(data.steps, 100, 1000),
    notice: typeof data.notice === 'string' ? data.notice.slice(0, 1000) : '',
    remark: typeof data.remark === 'string' ? data.remark.slice(0, 1000) : '',
    reference: typeof data.reference === 'string' ? data.reference.slice(0, 1000) : '',
  };
  await env.DB.prepare(`
    INSERT INTO dishes (
      id, name, type, spicy, images, steps, notice, remark, reference,
      creatorId, creatorOpenid, createTime, updateTime, familyId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, dish.name, dish.type, dish.spicy, JSON.stringify(dish.images), JSON.stringify(dish.steps),
    dish.notice, dish.remark, dish.reference, context.user.id, context.user.openid, now, now, context.familyId,
  ).run();
  try {
    await insertIngredients(env, id, parseIngredientInputs(data.ingredients), now);
  } catch (error) {
    await env.DB.prepare('DELETE FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
    throw error;
  }
  await writeAudit(env, context, 'dish.created', 'dish', id, { name: dish.name });
  return getDish(new Request(`${new URL(request.url).origin}/api/dish/detail?id=${id}`, { headers: request.headers }), env);
}

async function updateDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const data = await readJson<DishInput>(request, 256 * 1024);
  const id = requiredString(data.id, '菜品ID');
  const current = await env.DB.prepare('SELECT * FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const next = {
    name: data.name === undefined ? current.name : requiredString(data.name, '菜品名称', 80),
    type: data.type === undefined ? current.type : requiredString(data.type, '菜品类型', 40),
    spicy: data.spicy === undefined ? current.spicy : requiredString(data.spicy, '辣度', 20),
    images: data.images === undefined ? parseJsonField(current.images, []) : stringList(data.images, 20, 1000),
    steps: data.steps === undefined ? parseJsonField(current.steps, []) : stringList(data.steps, 100, 1000),
    notice: data.notice === undefined ? current.notice : typeof data.notice === 'string' ? data.notice.slice(0, 1000) : '',
    remark: data.remark === undefined ? current.remark : typeof data.remark === 'string' ? data.remark.slice(0, 1000) : '',
    reference: data.reference === undefined ? current.reference : typeof data.reference === 'string' ? data.reference.slice(0, 1000) : '',
  };
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE dishes SET name = ?, type = ?, spicy = ?, images = ?, steps = ?, notice = ?, remark = ?, reference = ?, updateTime = ?
    WHERE id = ? AND familyId = ?
  `).bind(
    next.name, next.type, next.spicy, JSON.stringify(next.images), JSON.stringify(next.steps),
    next.notice, next.remark, next.reference, now, id, context.familyId,
  ).run();
  if (data.ingredients !== undefined) {
    const inputs = parseIngredientInputs(data.ingredients);
    await env.DB.prepare('DELETE FROM ingredients WHERE dishId = ?').bind(id).run();
    await insertIngredients(env, id, inputs, now);
  }
  await writeAudit(env, context, 'dish.updated', 'dish', id);
  return getDish(new Request(`${new URL(request.url).origin}/api/dish/detail?id=${id}`, { headers: request.headers }), env);
}

async function deleteDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少菜品ID');
  const used = await env.DB.prepare(`
    SELECT 1 FROM appointment_dishes ad JOIN appointments a ON a.id = ad.appointmentId
    WHERE ad.dishId = ? AND a.familyId = ? AND a.status NOT IN ('已取消', 'cancelled') LIMIT 1
  `).bind(id, context.familyId).first();
  if (used) throw new ApiError(409, 'DISH_IN_USE', '菜品仍被预约使用，不能删除');
  const result = await env.DB.prepare('DELETE FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
  if (!result.meta.changes) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  await env.DB.prepare('DELETE FROM ingredients WHERE dishId = ?').bind(id).run();
  await writeAudit(env, context, 'dish.deleted', 'dish', id);
  return json({ success: true });
}

async function ingredientList(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const dishId = new URL(request.url).searchParams.get('dishId');
  if (dishId) {
    const dish = await env.DB.prepare('SELECT id FROM dishes WHERE id = ? AND familyId = ?').bind(dishId, context.familyId).first();
    if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
    const result = await env.DB.prepare('SELECT * FROM ingredients WHERE dishId = ? ORDER BY createTime').bind(dishId).all();
    return json(result.results);
  }
  const result = await env.DB.prepare(`
    SELECT c.*, group_concat(a.alias, '|') AS aliases
    FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
    GROUP BY c.id ORDER BY c.canonicalName LIMIT 500
  `).all();
  return json(result.results);
}

async function mutateIngredient(request: Request, env: Env, action: 'add' | 'update' | 'delete'): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  if (action === 'delete') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少食材ID');
    const result = await env.DB.prepare(`
      DELETE FROM ingredients WHERE id = ? AND dishId IN (SELECT id FROM dishes WHERE familyId = ?)
    `).bind(id, context.familyId).run();
    if (!result.meta.changes) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    return json({ success: true });
  }
  const input = await readJson<IngredientInput & { dishId?: unknown }>(request);
  const dishId = requiredString(input.dishId, '菜品ID');
  const dish = await env.DB.prepare('SELECT id FROM dishes WHERE id = ? AND familyId = ?').bind(dishId, context.familyId).first();
  if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const item = await normalizeIngredient(env, input);
  const now = Date.now();
  if (action === 'add') {
    await env.DB.prepare(`
      INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, dishId, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount).run();
  } else {
    const id = requiredString(input.id, '食材ID');
    const result = await env.DB.prepare(`
      UPDATE ingredients SET name = ?, amount = ?, updateTime = ?, ingredientId = ?, quantity = ?, unit = ?, legacyAmount = ?
      WHERE id = ? AND dishId = ?
    `).bind(item.name, item.amount, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount, id, dishId).run();
    if (!result.meta.changes) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    item.id = id;
  }
  await writeAudit(env, context, `ingredient.${action}ed`, 'dish', dishId, { ingredientId: item.id });
  return json({ ...item, dishId }, action === 'add' ? 201 : 200);
}

async function dinerPreferences(env: Env, context: FamilyContext, dinerIds: string[]): Promise<Array<{
  type: 'allergy' | 'avoid' | 'like' | 'spice'; value: string; userId: string; userName: string | null;
}>> {
  if (!dinerIds.length) {
    const diners = await env.DB.prepare(`SELECT userId FROM family_members WHERE familyId = ? AND status = 'active'`)
      .bind(context.familyId).all<{ userId: string }>();
    dinerIds = diners.results.map(row => row.userId);
  }
  const unique = Array.from(new Set(dinerIds)).slice(0, 20);
  const placeholders = unique.map(() => '?').join(',');
  if (!placeholders) return [];
  const result = await env.DB.prepare(`
    SELECT p.type, p.value, p.userId, u.nickName AS userName
    FROM user_food_preferences p JOIN users u ON u.id = p.userId
    JOIN family_members fm ON fm.userId = p.userId AND fm.familyId = ? AND fm.status = 'active'
    WHERE p.userId IN (${placeholders})
  `).bind(context.familyId, ...unique).all();
  return result.results as Array<{ type: 'allergy' | 'avoid' | 'like' | 'spice'; value: string; userId: string; userName: string | null }>;
}

async function recommend(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<{ dinerIds?: unknown; page?: unknown; pageSize?: unknown }>(request);
  const dinerIds = Array.isArray(body.dinerIds) ? body.dinerIds.filter((id): id is string => typeof id === 'string') : [];
  const page = Math.max(1, typeof body.page === 'number' ? Math.floor(body.page) : 1);
  const pageSize = Math.min(50, Math.max(1, typeof body.pageSize === 'number' ? Math.floor(body.pageSize) : 20));
  const [dishRows, ingredientRows, inventoryRows] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM dishes WHERE familyId = ? ORDER BY createTime DESC').bind(context.familyId),
    env.DB.prepare(`SELECT i.* FROM ingredients i JOIN dishes d ON d.id = i.dishId WHERE d.familyId = ?`).bind(context.familyId),
    env.DB.prepare(`SELECT * FROM inventory_items WHERE familyId = ? AND status NOT IN ('已用完', 'discarded')`).bind(context.familyId),
  ]);
  const preferences = await dinerPreferences(env, context, dinerIds);
  const inventory = inventoryRows.results as Array<Record<string, unknown>>;
  const ingredientsByDish = new Map<string, Array<Record<string, unknown>>>();
  for (const ingredient of ingredientRows.results as Array<Record<string, unknown>>) {
    const list = ingredientsByDish.get(String(ingredient.dishId)) || [];
    list.push(ingredient);
    ingredientsByDish.set(String(ingredient.dishId), list);
  }
  const expiryCutoff = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const recommendations = (dishRows.results as Array<Record<string, unknown>>).map(row => {
    const dish = mapDish(row);
    const required = ingredientsByDish.get(String(row.id)) || [];
    const existing: unknown[] = [];
    const missing: unknown[] = [];
    const expiring: unknown[] = [];
    for (const ingredient of required) {
      const matches = inventory.filter(item =>
        (ingredient.ingredientId && item.ingredientId === ingredient.ingredientId)
        || normalizeIngredientName(String(item.name)) === normalizeIngredientName(String(ingredient.name)),
      );
      const requiredNormalized = normalizeQuantity(ingredient.quantity, ingredient.unit);
      let covered = matches.length > 0;
      let availableQuantity: number | null = null;
      if (requiredNormalized) {
        const compatible = matches.map(item => normalizeQuantity(item.quantity, item.unit))
          .filter((item): item is NonNullable<typeof item> => Boolean(item && item.dimension === requiredNormalized.dimension));
        availableQuantity = compatible.reduce((sum, item) => sum + item.quantity, 0);
        covered = availableQuantity >= requiredNormalized.quantity;
      }
      const detail = { ...ingredient, availableQuantity };
      (covered ? existing : missing).push(detail);
      for (const item of matches) {
        if (typeof item.expiryDate === 'string' && item.expiryDate <= expiryCutoff) expiring.push(item);
      }
    }
    const warnings = collectPreferenceWarnings(
      required.map(item => typeof item.name === 'string' ? item.name : ''),
      typeof row.spicy === 'string' ? row.spicy : '', preferences,
    );
    return {
      ...dish,
      ingredients: required,
      coverageRate: required.length ? Math.round((existing.length / required.length) * 10000) / 100 : 100,
      existing, missing, expiring, warnings,
      expiringIngredientCount: expiring.length,
      warningCount: warnings.length,
      reasons: {
        stock: `${existing.length}/${required.length} 种食材已有`,
        expiring: expiring.length ? `可优先消耗 ${expiring.length} 项临期食材` : '无临期食材匹配',
        preference: warnings.length ? `${warnings.length} 项口味提醒` : '无口味冲突',
      },
    };
  }).sort(compareRecommendations);
  const offset = (page - 1) * pageSize;
  return json({ total: recommendations.length, list: recommendations.slice(offset, offset + pageSize), page, pageSize });
}

export async function handleDishV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/dish/list':
    case 'GET /api/dish/search': return listDishes(request, env);
    case 'GET /api/dish/detail': return getDish(request, env);
    case 'POST /api/dish/add': return addDish(request, env);
    case 'PUT /api/dish/update': return updateDish(request, env);
    case 'DELETE /api/dish/delete': return deleteDish(request, env);
    case 'GET /api/dish/ingredients': return ingredientList(request, env);
    case 'POST /api/dish/ingredient/add': return mutateIngredient(request, env, 'add');
    case 'PUT /api/dish/ingredient/update': return mutateIngredient(request, env, 'update');
    case 'DELETE /api/dish/ingredient/delete': return mutateIngredient(request, env, 'delete');
    case 'POST /api/dish/recommend': return recommend(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
