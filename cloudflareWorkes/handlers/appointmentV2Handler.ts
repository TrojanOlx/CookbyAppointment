import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { collectPreferenceWarnings, normalizeIngredientName, normalizeQuantity } from '../core/domain';
import { ApiError, json, pagination, parseJsonField, readJson, requiredString } from '../core/http';
import { normalizeImageList } from '../core/media';
import { withOperationLock } from '../core/operationLock';
import type { Env, FamilyContext } from '../core/types';
import { recalculateFamilyShoppingWithinLock, withFamilyShoppingLock } from './shoppingV2Handler';
import { notifyFamilyAppointment } from './notificationV2Handler';

interface AppointmentInput {
  id?: unknown;
  date?: unknown;
  mealType?: unknown;
  remarks?: unknown;
  dishIds?: unknown;
  dishes?: unknown;
  dinerIds?: unknown;
  warningsAcknowledged?: unknown;
  confirmDeduction?: unknown;
  deductions?: unknown;
}

function idList(value: unknown, field: string, max = 100): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, 'VALIDATION_ERROR', `${field}必须是数组`);
  const result = Array.from(new Set(value.map(item => requiredString(item, field, 100))));
  if (!result.length || result.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${field}数量无效`);
  return result;
}

function selectedDishIds(body: AppointmentInput): string[] {
  const source = body.dishIds ?? body.dishes;
  if (!Array.isArray(source)) throw new ApiError(400, 'VALIDATION_ERROR', '请至少选择一道菜');
  const values = source.map(item => typeof item === 'object' && item && 'id' in item ? (item as { id: unknown }).id : item);
  return idList(values, '菜品');
}

async function familyDinerIds(env: Env, context: FamilyContext, requested: unknown): Promise<string[]> {
  const rows = await env.DB.prepare(`SELECT userId FROM family_members WHERE familyId = ? AND status = 'active'`)
    .bind(context.familyId).all<{ userId: string }>();
  const valid = new Set(rows.results.map(row => row.userId));
  const dinerIds = requested === undefined || requested === null
    ? Array.from(valid)
    : idList(requested, '用餐成员', 20);
  const invalid = dinerIds.filter(id => !valid.has(id));
  if (invalid.length) throw new ApiError(400, 'DINER_NOT_MEMBER', '用餐人必须是当前家庭成员', { userIds: invalid });
  return dinerIds;
}

async function validateDishes(env: Env, context: FamilyContext, dishIds: string[]): Promise<Array<Record<string, unknown>>> {
  const placeholders = dishIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`SELECT * FROM dishes WHERE familyId = ? AND id IN (${placeholders})`)
    .bind(context.familyId, ...dishIds).all<Record<string, unknown>>();
  if (result.results.length !== dishIds.length) throw new ApiError(400, 'CROSS_FAMILY_DISH', '部分菜品不存在或不属于当前家庭');
  return result.results;
}

async function buildPreferencePreview(
  env: Env,
  context: FamilyContext,
  dishIds: string[],
  dinerIds: string[],
): Promise<{ warnings: ReturnType<typeof collectPreferenceWarnings>; diners: Array<Record<string, unknown>>; dishes: Array<Record<string, unknown>> }> {
  const dishes = await validateDishes(env, context, dishIds);
  const dishPlaceholders = dishIds.map(() => '?').join(',');
  const dinerPlaceholders = dinerIds.map(() => '?').join(',');
  const [ingredients, dinerRows, preferenceRows] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM ingredients WHERE dishId IN (${dishPlaceholders})`).bind(...dishIds),
    env.DB.prepare(`SELECT id, nickName, avatarUrl FROM users WHERE id IN (${dinerPlaceholders})`).bind(...dinerIds),
    env.DB.prepare(`
      SELECT p.type, p.value, p.userId, u.nickName AS userName
      FROM user_food_preferences p JOIN users u ON u.id = p.userId
      WHERE p.userId IN (${dinerPlaceholders})
    `).bind(...dinerIds),
  ]);
  const ingredientResults = ingredients.results as Array<Record<string, unknown>>;
  const dinerResults = dinerRows.results as Array<Record<string, unknown>>;
  const warnings = dishes.flatMap(dish => collectPreferenceWarnings(
    ingredientResults.filter(item => item.dishId === dish.id).map(item => typeof item.name === 'string' ? item.name : ''),
    typeof dish.spicy === 'string' ? dish.spicy : '',
    preferenceRows.results as Array<{ type: 'allergy' | 'avoid' | 'like' | 'spice'; value: string; userId: string; userName: string | null }>,
  ).map(warning => ({ ...warning, dishId: dish.id, dishName: dish.name })));
  return { warnings, diners: dinerResults, dishes };
}

async function preview(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<AppointmentInput>(request);
  const dishIds = selectedDishIds(body);
  const dinerIds = await familyDinerIds(env, context, body.dinerIds);
  const result = await buildPreferencePreview(env, context, dishIds, dinerIds);
  return json({ ...result, requiresAcknowledgement: result.warnings.length > 0 });
}

async function appointmentRelationStatements(
  env: Env,
  appointmentId: string,
  dishIds: string[],
  dinerIds: string[],
  now: number,
): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = dishIds.map(dishId => env.DB.prepare(`
    INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime) VALUES (?, ?, ?, ?)
  `).bind(crypto.randomUUID(), appointmentId, dishId, now));
  for (const userId of dinerIds) {
    const snapshot = await env.DB.prepare(`
      SELECT type, value, severity FROM user_food_preferences WHERE userId = ? ORDER BY type, createdAt
    `).bind(userId).all();
    statements.push(env.DB.prepare(`
      INSERT INTO appointment_diners (appointmentId, userId, preferenceSnapshot, createdAt)
      VALUES (?, ?, ?, ?)
    `).bind(appointmentId, userId, JSON.stringify(snapshot.results), now));
  }
  return statements;
}

async function createAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<AppointmentInput>(request);
  const dishIds = selectedDishIds(body);
  const dinerIds = await familyDinerIds(env, context, body.dinerIds);
  const preferencePreview = await buildPreferencePreview(env, context, dishIds, dinerIds);
  if (preferencePreview.warnings.length && body.warningsAcknowledged !== true) {
    throw new ApiError(409, 'PREFERENCE_WARNING_ACK_REQUIRED', '请确认用餐成员的口味提醒后再保存', {
      warnings: preferencePreview.warnings,
    });
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const date = requiredString(body.date, '用餐日期', 20);
  const mealType = requiredString(body.mealType, '餐次', 20);
  const remarks = typeof body.remarks === 'string' ? body.remarks.slice(0, 1000) : '';
  const relations = await appointmentRelationStatements(env, id, dishIds, dinerIds, now);
  await env.DB.batch([env.DB.prepare(`
    INSERT INTO appointments (
      id, userId, openid, date, mealType, status, remarks, createTime, updateTime,
      familyId, preferenceWarnings, warningsAcknowledged
    ) VALUES (?, ?, ?, ?, ?, '待确认', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, context.user.id, context.user.openid, date, mealType, remarks, now, now,
    context.familyId, JSON.stringify(preferencePreview.warnings), preferencePreview.warnings.length ? 1 : 0,
  ), ...relations]);
  await writeAudit(env, context, 'appointment.created', 'appointment', id, { dinerIds, warningCount: preferencePreview.warnings.length });
  await notifyFamilyAppointment(env, context.familyId, id, 'created');
  return appointmentDetailResponse(request, env, context, id, 201);
}

async function listAppointments(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const conditions = ['a.familyId = ?'];
  const bindings: unknown[] = [context.familyId];
  if (date) { conditions.push('a.date = ?'); bindings.push(date); }
  if (!date && startDate) { conditions.push('a.date >= ?'); bindings.push(startDate); }
  if (!date && endDate) { conditions.push('a.date <= ?'); bindings.push(endDate); }
  if (status) { conditions.push('a.status = ?'); bindings.push(status); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM appointments a WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT a.*, u.nickName, u.avatarUrl, u.phoneNumber,
        u.nickName AS userName, u.avatarUrl AS userAvatar, u.phoneNumber AS userPhone,
        (SELECT group_concat(ad.dishId) FROM appointment_dishes ad WHERE ad.appointmentId = a.id) AS dishIds,
        (SELECT group_concat(dn.userId) FROM appointment_diners dn WHERE dn.appointmentId = a.id) AS dinerIds,
        (SELECT json_group_array(json_object('id', d.id, 'name', d.name, 'type', d.type, 'images', d.images))
         FROM appointment_dishes ad JOIN dishes d ON d.id = ad.dishId
         WHERE ad.appointmentId = a.id AND d.familyId = a.familyId) AS dishesJson
      FROM appointments a JOIN users u ON u.id = a.userId
      WHERE ${where} ORDER BY a.date DESC, a.createTime DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  const list = (rows.results as Array<Record<string, unknown>>).map(row => ({
    ...row,
    preferenceWarnings: parseJsonField(row.preferenceWarnings, []),
    dishIds: typeof row.dishIds === 'string' && row.dishIds ? row.dishIds.split(',') : [],
    dinerIds: typeof row.dinerIds === 'string' && row.dinerIds ? row.dinerIds.split(',') : [],
    dishes: (parseJsonField<Array<Record<string, unknown>>>(row.dishesJson, [])).map(dish => ({
      ...dish,
      images: normalizeImageList(dish.images, env),
    })),
    dishesJson: undefined,
  }));
  return json({ total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0), list, page, pageSize });
}

async function appointmentDetailResponse(
  request: Request,
  env: Env,
  context: FamilyContext,
  id: string,
  status = 200,
): Promise<Response> {
  const appointment = await env.DB.prepare(`
    SELECT a.*, u.nickName, u.avatarUrl FROM appointments a JOIN users u ON u.id = a.userId
    WHERE a.id = ? AND a.familyId = ?
  `).bind(id, context.familyId).first<Record<string, unknown>>();
  if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
  const [dishes, diners] = await env.DB.batch([
    env.DB.prepare(`
      SELECT d.* FROM appointment_dishes ad JOIN dishes d ON d.id = ad.dishId
      WHERE ad.appointmentId = ? AND d.familyId = ? ORDER BY ad.createTime
    `).bind(id, context.familyId),
    env.DB.prepare(`
      SELECT u.id AS userId, u.nickName, u.avatarUrl, ad.preferenceSnapshot
      FROM appointment_diners ad JOIN users u ON u.id = ad.userId WHERE ad.appointmentId = ?
    `).bind(id),
  ]);
  return json({
    ...appointment,
    preferenceWarnings: parseJsonField(appointment.preferenceWarnings, []),
    dishes: (dishes.results as Array<Record<string, unknown>>).map(row => ({ ...row, images: normalizeImageList(row.images, env), steps: parseJsonField(row.steps, []) })),
    diners: (diners.results as Array<Record<string, unknown>>).map(row => ({ ...row, preferenceSnapshot: parseJsonField(row.preferenceSnapshot, []) })),
  }, status);
}

async function getAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少预约ID');
  return appointmentDetailResponse(request, env, context, id);
}

function canModify(context: FamilyContext, appointment: { userId: string; status: string }): boolean {
  if (['已完成', 'completed', '已取消', 'cancelled'].includes(appointment.status)) return false;
  if (['owner', 'admin', 'chef'].includes(context.role)) return true;
  return appointment.userId === context.user.id && ['待确认', 'pending'].includes(appointment.status);
}

function withAppointmentShoppingLock<T>(
  env: Env,
  context: FamilyContext,
  appointmentId: string,
  execute: () => Promise<T>,
): Promise<T> {
  return withFamilyShoppingLock(env, context.familyId, () =>
    withOperationLock(env, `appointment:${context.familyId}:${appointmentId}`, execute));
}

async function updateAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<AppointmentInput>(request);
  const id = requiredString(body.id, '预约ID');
  return withAppointmentShoppingLock(env, context, id, async () => {
    const current = await env.DB.prepare('SELECT * FROM appointments WHERE id = ? AND familyId = ?')
      .bind(id, context.familyId).first<{ userId: string; status: string; date: string; mealType: string; remarks: string }>();
    if (!current) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
    if (['已完成', 'completed', '已取消', 'cancelled'].includes(current.status)) throw new ApiError(409, 'APPOINTMENT_FINAL', '已结束的预约不能修改');
    if (!canModify(context, current)) throw new ApiError(403, 'APPOINTMENT_EDIT_FORBIDDEN', '只能修改自己的待确认预约');

    const [existingDishRows, existingDinerRows] = await env.DB.batch([
      env.DB.prepare('SELECT dishId FROM appointment_dishes WHERE appointmentId = ?').bind(id),
      env.DB.prepare('SELECT userId FROM appointment_diners WHERE appointmentId = ?').bind(id),
    ]);
    const dishIds = body.dishIds === undefined && body.dishes === undefined
      ? (existingDishRows.results as Array<{ dishId: string }>).map(row => row.dishId)
      : selectedDishIds(body);
    const dinerIds = body.dinerIds === undefined
      ? (existingDinerRows.results as Array<{ userId: string }>).map(row => row.userId)
      : await familyDinerIds(env, context, body.dinerIds);
    const preferencePreview = await buildPreferencePreview(env, context, dishIds, dinerIds);
    if (preferencePreview.warnings.length && body.warningsAcknowledged !== true) {
      throw new ApiError(409, 'PREFERENCE_WARNING_ACK_REQUIRED', '请确认用餐成员的口味提醒后再保存', { warnings: preferencePreview.warnings });
    }
    const now = Date.now();
    const relations = await appointmentRelationStatements(env, id, dishIds, dinerIds, now);
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE appointments SET date = ?, mealType = ?, remarks = ?, preferenceWarnings = ?, warningsAcknowledged = ?, updateTime = ?
        WHERE id = ? AND familyId = ? AND status = ?
      `).bind(
        body.date === undefined ? current.date : requiredString(body.date, '用餐日期', 20),
        body.mealType === undefined ? current.mealType : requiredString(body.mealType, '餐次', 20),
        body.remarks === undefined ? current.remarks : typeof body.remarks === 'string' ? body.remarks.slice(0, 1000) : '',
        JSON.stringify(preferencePreview.warnings), preferencePreview.warnings.length ? 1 : 0,
        now, id, context.familyId, current.status,
      ),
      env.DB.prepare('DELETE FROM appointment_dishes WHERE appointmentId = ?').bind(id),
      env.DB.prepare('DELETE FROM appointment_diners WHERE appointmentId = ?').bind(id),
      ...relations,
    ]);
    if (!results[0].meta.changes) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '预约状态已变化，请刷新后重试');
    if (['已确认', 'confirmed'].includes(current.status)) await recalculateFamilyShoppingWithinLock(env, context);
    await writeAudit(env, context, 'appointment.updated', 'appointment', id);
    return appointmentDetailResponse(request, env, context, id);
  });
}

async function withIdempotency(
  request: Request,
  env: Env,
  context: FamilyContext,
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
  `).bind(context.familyId, context.user.id, key, operation, now, now - 5 * 60 * 1000).run();
  if (!claimed.meta.changes) {
    const existing = await env.DB.prepare(`
      SELECT responseStatus, responseBody FROM idempotency_keys
      WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?
    `).bind(context.familyId, context.user.id, operation, key)
      .first<{ responseStatus: number | null; responseBody: string | null }>();
    if (existing?.responseBody) return new Response(existing.responseBody, { status: existing.responseStatus || 200, headers: { 'Content-Type': 'application/json' } });
    throw new ApiError(409, 'OPERATION_IN_PROGRESS', '相同操作正在处理中');
  }
  try {
    const response = await execute();
    const body = await response.clone().text();
    await env.DB.prepare(`
      UPDATE idempotency_keys SET responseStatus = ?, responseBody = ?
      WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?
    `).bind(response.status, body, context.familyId, context.user.id, operation, key).run();
    return response;
  } catch (error) {
    await env.DB.prepare('DELETE FROM idempotency_keys WHERE familyId = ? AND userId = ? AND operation = ? AND key = ?')
      .bind(context.familyId, context.user.id, operation, key).run();
    throw error;
  }
}

async function confirmAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'appointment.manage');
  const body = await readJson<AppointmentInput>(request);
  const id = requiredString(body.id, '预约ID');
  return withIdempotency(request, env, context, `appointment.confirm:${id}`, () =>
    withAppointmentShoppingLock(env, context, id, async () => {
      const result = await env.DB.prepare(`
        UPDATE appointments SET status = '已确认', updateTime = ?
        WHERE id = ? AND familyId = ? AND status IN ('待确认', 'pending')
      `).bind(Date.now(), id, context.familyId).run();
      if (!result.meta.changes) {
        const existing = await env.DB.prepare('SELECT status FROM appointments WHERE id = ? AND familyId = ?').bind(id, context.familyId).first<{ status: string }>();
        if (!existing) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
        if (['已确认', 'confirmed'].includes(existing.status)) return appointmentDetailResponse(request, env, context, id);
        throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '当前预约状态不能确认');
      }
      await recalculateFamilyShoppingWithinLock(env, context);
      await writeAudit(env, context, 'appointment.confirmed', 'appointment', id);
      await notifyFamilyAppointment(env, context.familyId, id, 'confirmed');
      return appointmentDetailResponse(request, env, context, id);
    }));
}

async function cancelAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<AppointmentInput>(request);
  const id = requiredString(body.id, '预约ID');
  return withAppointmentShoppingLock(env, context, id, async () => {
    const current = await env.DB.prepare('SELECT userId, status FROM appointments WHERE id = ? AND familyId = ?')
      .bind(id, context.familyId).first<{ userId: string; status: string }>();
    if (!current) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
    if (['已完成', 'completed', '已取消', 'cancelled'].includes(current.status)) throw new ApiError(409, 'APPOINTMENT_FINAL', '预约已经结束');
    if (!canModify(context, current)) throw new ApiError(403, 'APPOINTMENT_CANCEL_FORBIDDEN', '只能取消自己的待确认预约');
    if (['已确认', 'confirmed'].includes(current.status)) requireCapability(context, 'appointment.manage');
    const cancelled = await env.DB.prepare(`
      UPDATE appointments SET status = '已取消', updateTime = ?
      WHERE id = ? AND familyId = ? AND status = ?
    `).bind(Date.now(), id, context.familyId, current.status).run();
    if (!cancelled.meta.changes) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '预约状态已变化，请刷新后重试');
    if (['已确认', 'confirmed'].includes(current.status)) await recalculateFamilyShoppingWithinLock(env, context);
    await writeAudit(env, context, 'appointment.cancelled', 'appointment', id);
    await notifyFamilyAppointment(env, context.familyId, id, 'cancelled');
    return json({ success: true, id, status: '已取消' });
  });
}

interface Deduction { id: string; quantity: number; unit: string | null; name: string; }

async function consumptionPlan(env: Env, context: FamilyContext, appointmentId: string): Promise<{ deductions: Deduction[]; unresolved: unknown[] }> {
  const [requirements, inventory] = await env.DB.batch([
    env.DB.prepare(`
      SELECT i.* FROM appointment_dishes ad JOIN dishes d ON d.id = ad.dishId
      JOIN ingredients i ON i.dishId = d.id
      WHERE ad.appointmentId = ? AND d.familyId = ?
    `).bind(appointmentId, context.familyId),
    env.DB.prepare(`
      SELECT * FROM inventory_items WHERE familyId = ? AND status NOT IN ('已用完', 'discarded')
      ORDER BY expiryDate IS NULL, expiryDate ASC, createTime ASC
    `).bind(context.familyId),
  ]);
  const requirementRows = requirements.results as Array<Record<string, unknown>>;
  const inventoryItems = inventory.results as Array<Record<string, unknown>>;
  const deductions: Deduction[] = [];
  const deductionIndexes = new Map<string, number>();
  const availableByInventory = new Map<string, number>();
  const unresolved: unknown[] = [];
  for (const requirement of requirementRows) {
    const required = normalizeQuantity(requirement.quantity, requirement.unit);
    if (!required) { unresolved.push({ ...requirement, reason: 'quantity_not_convertible' }); continue; }
    let remaining = required.quantity;
    for (const item of inventoryItems) {
      const matches = (requirement.ingredientId && item.ingredientId === requirement.ingredientId)
        || normalizeIngredientName(String(item.name)) === normalizeIngredientName(String(requirement.name));
      if (!matches) continue;
      const available = normalizeQuantity(item.quantity, item.unit);
      const originalQuantity = Number(item.quantity);
      if (!available || available.dimension !== required.dimension || remaining <= 0 || originalQuantity <= 0) continue;
      const inventoryId = String(item.id);
      const availableCanonical = availableByInventory.get(inventoryId) ?? available.quantity;
      if (availableCanonical <= 0) continue;
      const takeCanonical = Math.min(remaining, availableCanonical);
      const takeOriginal = takeCanonical / (available.quantity / originalQuantity);
      const deductionIndex = deductionIndexes.get(inventoryId);
      if (deductionIndex === undefined) {
        deductionIndexes.set(inventoryId, deductions.length);
        deductions.push({
          id: inventoryId, quantity: takeOriginal,
          unit: typeof item.unit === 'string' ? item.unit : null,
          name: typeof item.name === 'string' ? item.name : '',
        });
      } else {
        deductions[deductionIndex].quantity += takeOriginal;
      }
      availableByInventory.set(inventoryId, availableCanonical - takeCanonical);
      remaining -= takeCanonical;
    }
    if (remaining > 0) unresolved.push({ ...requirement, reason: 'inventory_insufficient', missingQuantity: remaining, unit: required.unit });
  }
  return { deductions, unresolved };
}

async function completeAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'appointment.manage');
  const body = await readJson<AppointmentInput>(request);
  const id = requiredString(body.id, '预约ID');
  if (body.confirmDeduction !== true) {
    return withOperationLock(env, `appointment:${context.familyId}:${id}`, async () => {
      const appointment = await env.DB.prepare('SELECT status FROM appointments WHERE id = ? AND familyId = ?')
        .bind(id, context.familyId).first<{ status: string }>();
      if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
      if (!['已确认', 'confirmed'].includes(appointment.status)) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '只有已确认预约可以完成');
      return json({ requiresInventoryConfirmation: true, ...await consumptionPlan(env, context, id) });
    });
  }
  return withIdempotency(request, env, context, `appointment.complete:${id}`, () =>
    withAppointmentShoppingLock(env, context, id, async () => {
      const appointment = await env.DB.prepare('SELECT status, updateTime FROM appointments WHERE id = ? AND familyId = ?')
        .bind(id, context.familyId).first<{ status: string; updateTime: number }>();
      if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
      if (appointment.status === '完成中' && appointment.updateTime < Date.now() - 5 * 60 * 1000) {
        const recovered = await env.DB.prepare(`
          UPDATE appointments SET status = '已确认', updateTime = ?
          WHERE id = ? AND familyId = ? AND status = '完成中' AND updateTime = ?
        `).bind(Date.now(), id, context.familyId, appointment.updateTime).run();
        if (recovered.meta.changes) appointment.status = '已确认';
      }
      if (!['已确认', 'confirmed'].includes(appointment.status)) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '只有已确认预约可以完成');

      const estimated = await consumptionPlan(env, context, id);
      const requestedInput = body.deductions === undefined ? estimated.deductions : body.deductions;
      if (!Array.isArray(requestedInput)) throw new ApiError(400, 'VALIDATION_ERROR', '库存扣减列表无效');
      const requestedById = new Map<string, number>();
      for (const entry of requestedInput) {
        if (!entry || typeof entry !== 'object') throw new ApiError(400, 'VALIDATION_ERROR', '库存扣减项无效');
        const deduction = entry as { id?: unknown; quantity?: unknown };
        const inventoryId = requiredString(deduction.id, '库存ID');
        const quantity = typeof deduction.quantity === 'number' && Number.isFinite(deduction.quantity) && deduction.quantity >= 0
          ? deduction.quantity : null;
        if (quantity === null) throw new ApiError(400, 'INVALID_QUANTITY', '扣减数量无效');
        requestedById.set(inventoryId, (requestedById.get(inventoryId) || 0) + quantity);
      }
      const requested = Array.from(requestedById, ([inventoryId, quantity]) => ({ id: inventoryId, quantity }));

      const claimed = await env.DB.prepare(`
        UPDATE appointments SET status = '完成中', updateTime = ?
        WHERE id = ? AND familyId = ? AND status IN ('已确认', 'confirmed')
      `).bind(Date.now(), id, context.familyId).run();
      if (!claimed.meta.changes) throw new ApiError(409, 'APPOINTMENT_OPERATION_IN_PROGRESS', '预约已被其他请求处理，请刷新后重试');
      try {
        const statements: D1PreparedStatement[] = [];
        for (const deduction of requested) {
          const item = await env.DB.prepare('SELECT quantity FROM inventory_items WHERE id = ? AND familyId = ?')
            .bind(deduction.id, context.familyId).first<{ quantity: number | null }>();
          if (!item || item.quantity === null) throw new ApiError(409, 'INVENTORY_NOT_DEDUCTIBLE', '库存不存在或数量不可换算', { inventoryId: deduction.id });
          if (item.quantity < deduction.quantity) throw new ApiError(409, 'INVENTORY_INSUFFICIENT', '库存不足', { inventoryId: deduction.id, available: item.quantity });
          statements.push(env.DB.prepare(`
            UPDATE inventory_items SET quantity = quantity - ?, amount = CAST(quantity - ? AS TEXT) || COALESCE(unit, ''), updateTime = ?
            WHERE id = ? AND familyId = ?
              AND EXISTS (
                SELECT 1 FROM appointments
                WHERE id = ? AND familyId = ? AND status = '完成中'
              )
          `).bind(deduction.quantity, deduction.quantity, Date.now(), deduction.id, context.familyId, id, context.familyId));
        }
        statements.push(env.DB.prepare(`
          UPDATE appointments SET status = '已完成', updateTime = ?
          WHERE id = ? AND familyId = ? AND status = '完成中'
        `).bind(Date.now(), id, context.familyId));
        const results = await env.DB.batch(statements);
        if (!results[results.length - 1].meta.changes) {
          throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '预约已被其他请求处理，请刷新后重试');
        }
      } catch (error) {
        await env.DB.prepare(`
          UPDATE appointments SET status = '已确认', updateTime = ?
          WHERE id = ? AND familyId = ? AND status = '完成中'
        `).bind(Date.now(), id, context.familyId).run();
        if (error instanceof Error && error.message.includes('inventory quantity')) {
          throw new ApiError(409, 'INVENTORY_INSUFFICIENT', '库存已发生变化，请重新确认扣减');
        }
        throw error;
      }
      await recalculateFamilyShoppingWithinLock(env, context);
      await writeAudit(env, context, 'appointment.completed', 'appointment', id, { deductions: requested, unresolved: estimated.unresolved });
      await notifyFamilyAppointment(env, context.familyId, id, 'completed');
      return json({ success: true, id, status: '已完成', deductions: requested, unresolved: estimated.unresolved });
    }));
}

async function appointmentDishes(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const appointmentId = new URL(request.url).searchParams.get('appointmentId');
  if (!appointmentId) throw new ApiError(400, 'VALIDATION_ERROR', '缺少预约ID');
  const appointment = await env.DB.prepare('SELECT id FROM appointments WHERE id = ? AND familyId = ?').bind(appointmentId, context.familyId).first();
  if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
  const rows = await env.DB.prepare(`
    SELECT ad.id, ad.appointmentId, ad.dishId, ad.createTime, d.name, d.type, d.images
    FROM appointment_dishes ad JOIN dishes d ON d.id = ad.dishId
    WHERE ad.appointmentId = ? AND d.familyId = ?
  `).bind(appointmentId, context.familyId).all();
  return json(rows.results.map(row => ({ ...row, images: normalizeImageList(row.images, env) })));
}

async function addAppointmentDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<{ appointmentId?: unknown; dishId?: unknown }>(request);
  const appointmentId = requiredString(body.appointmentId, '预约ID');
  const dishId = requiredString(body.dishId, '菜品ID');
  return withAppointmentShoppingLock(env, context, appointmentId, async () => {
    const appointment = await env.DB.prepare('SELECT userId, status FROM appointments WHERE id = ? AND familyId = ?')
      .bind(appointmentId, context.familyId).first<{ userId: string; status: string }>();
    if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
    if (['已完成', 'completed', '已取消', 'cancelled'].includes(appointment.status)) throw new ApiError(409, 'APPOINTMENT_FINAL', '已结束的预约不能修改');
    if (!canModify(context, appointment)) throw new ApiError(403, 'APPOINTMENT_EDIT_FORBIDDEN', '无权修改该预约');
    await validateDishes(env, context, [dishId]);
    const existing = await env.DB.prepare('SELECT id FROM appointment_dishes WHERE appointmentId = ? AND dishId = ?').bind(appointmentId, dishId).first();
    if (existing) return json(existing);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime) VALUES (?, ?, ?, ?)')
      .bind(id, appointmentId, dishId, Date.now()).run();
    if (['已确认', 'confirmed'].includes(appointment.status)) await recalculateFamilyShoppingWithinLock(env, context);
    return json({ id, appointmentId, dishId }, 201);
  });
}

async function removeAppointmentDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const relationId = url.searchParams.get('id');
  if (!relationId) throw new ApiError(400, 'VALIDATION_ERROR', '缺少关联ID');
  const initial = await env.DB.prepare(`
    SELECT ad.id, ad.appointmentId, a.userId, a.status
    FROM appointment_dishes ad JOIN appointments a ON a.id = ad.appointmentId
    WHERE ad.id = ? AND a.familyId = ?
  `).bind(relationId, context.familyId).first<{ id: string; appointmentId: string; userId: string; status: string }>();
  if (!initial) throw new ApiError(404, 'APPOINTMENT_DISH_NOT_FOUND', '预约菜品关联不存在');
  return withAppointmentShoppingLock(env, context, initial.appointmentId, async () => {
    const relation = await env.DB.prepare(`
      SELECT ad.id, ad.appointmentId, a.userId, a.status
      FROM appointment_dishes ad JOIN appointments a ON a.id = ad.appointmentId
      WHERE ad.id = ? AND a.familyId = ?
    `).bind(relationId, context.familyId).first<{ id: string; appointmentId: string; userId: string; status: string }>();
    if (!relation) throw new ApiError(404, 'APPOINTMENT_DISH_NOT_FOUND', '预约菜品关联不存在');
    if (['已完成', 'completed', '已取消', 'cancelled'].includes(relation.status)) throw new ApiError(409, 'APPOINTMENT_FINAL', '已结束的预约不能修改');
    if (!canModify(context, relation)) throw new ApiError(403, 'APPOINTMENT_EDIT_FORBIDDEN', '无权修改该预约');
    await env.DB.prepare('DELETE FROM appointment_dishes WHERE id = ?').bind(relationId).run();
    if (['已确认', 'confirmed'].includes(relation.status)) await recalculateFamilyShoppingWithinLock(env, context);
    return json({ success: true });
  });
}

async function reactivateAppointment(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<AppointmentInput>(request);
  const id = requiredString(body.id, '预约ID');
  return withOperationLock(env, `appointment:${context.familyId}:${id}`, async () => {
    const appointment = await env.DB.prepare('SELECT userId, status FROM appointments WHERE id = ? AND familyId = ?')
      .bind(id, context.familyId).first<{ userId: string; status: string }>();
    if (!appointment) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', '预约不存在');
    if (appointment.userId !== context.user.id && !['owner', 'admin', 'chef'].includes(context.role)) throw new ApiError(403, 'ROLE_FORBIDDEN', '无权恢复该预约');
    if (!['已取消', 'cancelled'].includes(appointment.status)) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '只有已取消预约可恢复');
    const reactivated = await env.DB.prepare(`
      UPDATE appointments SET status = '待确认', updateTime = ?
      WHERE id = ? AND familyId = ? AND status = ?
    `).bind(Date.now(), id, context.familyId, appointment.status).run();
    if (!reactivated.meta.changes) throw new ApiError(409, 'APPOINTMENT_STATUS_INVALID', '预约状态已变化，请刷新后重试');
    return json({ success: true, id, status: '待确认' });
  });
}

export async function handleAppointmentV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'POST /api/appointment/preview': return preview(request, env);
    case 'GET /api/appointment/list':
    case 'GET /api/appointment/date':
    case 'GET /api/admin/appointment/list':
    case 'GET /api/admin/appointment/date': return listAppointments(request, env);
    case 'GET /api/appointment/detail': return getAppointment(request, env);
    case 'POST /api/appointment/create': return createAppointment(request, env);
    case 'PUT /api/appointment/update': return updateAppointment(request, env);
    case 'PUT /api/appointment/cancel': return cancelAppointment(request, env);
    case 'PUT /api/appointment/confirm': return confirmAppointment(request, env);
    case 'PUT /api/appointment/complete': return completeAppointment(request, env);
    case 'GET /api/appointment/dishes': return appointmentDishes(request, env);
    case 'POST /api/appointment/dish/add': return addAppointmentDish(request, env);
    case 'DELETE /api/appointment/dish/remove': return removeAppointmentDish(request, env);
    case 'PUT /api/appointment/reactivate': return reactivateAppointment(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
