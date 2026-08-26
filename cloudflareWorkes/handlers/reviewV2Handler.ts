import { requireFamilyContext, writeAudit } from '../core/auth';
import { ApiError, json, pagination, parseJsonField, readJson, requiredString } from '../core/http';
import { normalizeImageList } from '../core/media';
import type { Env } from '../core/types';
import { claimFamilyImages, expireDetachedTargetFiles, expireTargetFiles } from '../core/uploadSecurity';
import { strictText, strictTextArray } from '../core/validation';

interface ReviewInput {
  id?: unknown;
  appointmentId?: unknown;
  dishId?: unknown;
  rating?: unknown;
  content?: unknown;
  images?: unknown;
}

function images(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = [value]; }
  }
  return strictTextArray(parsed, '评价图片', 3, 1000);
}

async function listReviews(request: Request, env: Env, mode: 'user' | 'dish' | 'appointment' | 'admin'): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const conditions = ['r.familyId = ?'];
  const bindings: unknown[] = [context.familyId];
  if (mode === 'user') {
    const userId = url.searchParams.get('userId') || context.user.id;
    if (userId !== context.user.id && !['owner', 'admin'].includes(context.role)) throw new ApiError(403, 'ROLE_FORBIDDEN', '无权查看该用户的评价');
    conditions.push('r.userId = ?'); bindings.push(userId);
  }
  if (mode === 'dish') { conditions.push('r.dishId = ?'); bindings.push(requiredString(url.searchParams.get('dishId'), '菜品ID')); }
  if (mode === 'appointment') { conditions.push('r.appointmentId = ?'); bindings.push(requiredString(url.searchParams.get('appointmentId'), '预约ID')); }
  if (mode === 'admin' && !['owner', 'admin'].includes(context.role)) throw new ApiError(403, 'ROLE_FORBIDDEN', '仅家庭主或管理员可查看管理列表');
  const maxRating = Number(url.searchParams.get('maxRating') || 0);
  if (mode === 'admin' && Number.isInteger(maxRating) && maxRating >= 1 && maxRating <= 5) {
    conditions.push('r.rating <= ?'); bindings.push(maxRating);
  }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM reviews r WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`
      SELECT r.*, u.nickName, u.avatarUrl, d.name AS dishName, d.images AS dishImages,
        a.date AS appointmentDate, a.mealType
      FROM reviews r
      JOIN users u ON u.id = r.userId
      JOIN dishes d ON d.id = r.dishId
      LEFT JOIN appointments a ON a.id = r.appointmentId AND a.familyId = r.familyId
      WHERE ${where} ORDER BY r.createTime DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: (rows.results as Array<Record<string, unknown>>).map(row => {
      const dishImages = normalizeImageList(row.dishImages, env);
      return {
        ...row,
        images: normalizeImageList(row.images, env),
        dishImage: dishImages[0] || '',
        dishImages: undefined,
      };
    }),
    page, pageSize,
  });
}

async function addReview(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<ReviewInput>(request);
  const appointmentId = requiredString(body.appointmentId, '预约ID');
  const dishId = requiredString(body.dishId, '菜品ID');
  const rating = typeof body.rating === 'number' && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  if (!rating) throw new ApiError(400, 'VALIDATION_ERROR', '评分必须为1到5');
  const relation = await env.DB.prepare(`
    SELECT a.id FROM appointments a
    JOIN appointment_dishes ad ON ad.appointmentId = a.id AND ad.dishId = ?
    JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId
    LEFT JOIN appointment_diners diner ON diner.appointmentId = a.id AND diner.userId = ?
    WHERE a.id = ? AND a.familyId = ? AND (a.userId = ? OR diner.userId IS NOT NULL)
  `).bind(dishId, context.user.id, appointmentId, context.familyId, context.user.id).first();
  if (!relation) throw new ApiError(400, 'REVIEW_RELATION_INVALID', '只能评价自己参与用餐的家庭预约菜品');
  const duplicate = await env.DB.prepare(`SELECT id FROM reviews WHERE familyId = ? AND appointmentId = ? AND dishId = ? AND userId = ?`)
    .bind(context.familyId, appointmentId, dishId, context.user.id).first();
  if (duplicate) throw new ApiError(409, 'REVIEW_EXISTS', '已经评价过该菜品');
  const id = crypto.randomUUID();
  const now = Date.now();
  const reviewImages = images(body.images);
  const content = strictText(body.content, '评价内容', 200, { allowNewlines: true });
  await env.DB.prepare(`
    INSERT INTO reviews (
      id, appointmentId, userId, openid, dishId, rating, content, images, createTime, updateTime, familyId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, appointmentId, context.user.id, context.user.openid, dishId, rating, content,
    JSON.stringify(reviewImages), now, now, context.familyId,
  ).run();
  try {
    await claimFamilyImages(env, context, reviewImages, 'review', id, 3);
  } catch (error) {
    await env.DB.prepare('DELETE FROM reviews WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
    await expireTargetFiles(env, context.familyId, 'review', id);
    throw error;
  }
  await writeAudit(env, context, 'review.created', 'review', id, { appointmentId, dishId });
  return json({ id, appointmentId, dishId, rating, content, images: reviewImages, createTime: now, updateTime: now }, 201);
}

async function updateReview(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<ReviewInput>(request);
  const id = requiredString(body.id, '评价ID');
  const current = await env.DB.prepare('SELECT * FROM reviews WHERE id = ? AND familyId = ?').bind(id, context.familyId).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'REVIEW_NOT_FOUND', '评价不存在');
  if (current.userId !== context.user.id) throw new ApiError(403, 'REVIEW_EDIT_FORBIDDEN', '只能修改自己的评价');
  const rating = body.rating === undefined ? current.rating
    : typeof body.rating === 'number' && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  if (!rating) throw new ApiError(400, 'VALIDATION_ERROR', '评分必须为1到5');
  const content = body.content === undefined ? current.content : strictText(body.content, '评价内容', 200, { allowNewlines: true });
  const reviewImages = body.images === undefined ? parseJsonField(current.images, []) : images(body.images);
  const currentImages = parseJsonField<string[]>(current.images, []);
  if (body.images !== undefined) {
    await claimFamilyImages(env, context, reviewImages, 'review', id, 3, currentImages);
  }
  const updateTime = Date.now();
  try {
    await env.DB.prepare('UPDATE reviews SET rating = ?, content = ?, images = ?, updateTime = ? WHERE id = ? AND familyId = ?')
      .bind(rating, content, JSON.stringify(reviewImages), updateTime, id, context.familyId).run();
  } catch (error) {
    if (body.images !== undefined) {
      await expireDetachedTargetFiles(env, context.familyId, 'review', id, currentImages);
    }
    throw error;
  }
  if (body.images !== undefined) {
    await expireDetachedTargetFiles(env, context.familyId, 'review', id, reviewImages);
  }
  await writeAudit(env, context, 'review.updated', 'review', id);
  return json({ ...current, rating, content, images: reviewImages, updateTime });
}

async function deleteReview(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少评价ID');
  const current = await env.DB.prepare('SELECT userId FROM reviews WHERE id = ? AND familyId = ?').bind(id, context.familyId).first<{ userId: string }>();
  if (!current) throw new ApiError(404, 'REVIEW_NOT_FOUND', '评价不存在');
  if (current.userId !== context.user.id && !['owner', 'admin'].includes(context.role)) throw new ApiError(403, 'REVIEW_DELETE_FORBIDDEN', '无权删除该评价');
  await env.DB.prepare('DELETE FROM reviews WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
  await expireTargetFiles(env, context.familyId, 'review', id);
  await writeAudit(env, context, 'review.deleted', 'review', id);
  return json({ success: true });
}

export async function handleReviewV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/review/user': return listReviews(request, env, 'user');
    case 'GET /api/review/dish': return listReviews(request, env, 'dish');
    case 'GET /api/review/appointment': return listReviews(request, env, 'appointment');
    case 'GET /api/admin/review/list': return listReviews(request, env, 'admin');
    case 'POST /api/review/add': return addReview(request, env);
    case 'PUT /api/review/update': return updateReview(request, env);
    case 'DELETE /api/review/delete': return deleteReview(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
