import { checkRateLimit, generateSecret, requireAuth, requireFamilyContext, sha256Hex, writeAudit } from '../core/auth';
import { ApiError, json, readJson, requiredString } from '../core/http';
import { withOperationLock } from '../core/operationLock';
import type { Env } from '../core/types';
import {
  createAbsoluteFileAccessUrl,
  createStableFilePath,
  fileIdFromAccessUrl,
} from './fileV2Handler';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function avatarForResponse(request: Request, env: Env, userId: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value) return '';
  const fileId = fileIdFromAccessUrl(value);
  if (!fileId) return value;
  const file = await env.DB.prepare(`
    SELECT id, familyId FROM family_files
    WHERE id = ? AND uploadedBy = ? AND deletedAt IS NULL
  `).bind(fileId, userId).first<{ id: string; familyId: string }>();
  if (!file) return '';
  return createAbsoluteFileAccessUrl(request, env, file.id, file.familyId);
}

async function avatarForStorage(env: Env, userId: string, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const fileId = fileIdFromAccessUrl(trimmed);
  if (fileId) {
    const owned = await env.DB.prepare(`
      SELECT 1 FROM family_files WHERE id = ? AND uploadedBy = ? AND deletedAt IS NULL
    `).bind(fileId, userId).first();
    if (!owned) throw new ApiError(403, 'AVATAR_FILE_FORBIDDEN', '头像文件不属于当前用户');
    return createStableFilePath(fileId);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ApiError(400, 'AVATAR_URL_INVALID', '头像地址无效');
  }
  if (parsed.protocol !== 'https:') throw new ApiError(400, 'AVATAR_URL_INVALID', '头像地址必须使用 HTTPS');
  return trimmed.slice(0, 1000);
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ code?: unknown }>(request);
  const code = requiredString(body.code, '登录凭证', 256);
  await checkRateLimit(env, `login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`, 30);
  const wxResponse = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?appid=${env.WX_APPID}&secret=${env.WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`,
  );
  const wxResult = await wxResponse.json<{ openid?: string; unionid?: string; errcode?: number; errmsg?: string }>();
  if (!wxResponse.ok || wxResult.errcode || !wxResult.openid) {
    throw new ApiError(401, 'WECHAT_LOGIN_FAILED', wxResult.errmsg || '微信登录失败');
  }

  const now = Date.now();
  let user = await env.DB.prepare('SELECT id, openid, nickName, avatarUrl, phoneNumber, status FROM users WHERE openid = ?')
    .bind(wxResult.openid).first<{ id: string; openid: string; nickName: string | null; avatarUrl: string | null; phoneNumber: string | null; status: string }>();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO users (id, openid, nickName, avatarUrl, gender, country, province, city, language, isAdmin, createTime, updateTime)
      VALUES (?, ?, '', '', 0, '', '', '', 'zh_CN', 0, ?, ?)
    `).bind(id, wxResult.openid, now, now).run();
    user = { id, openid: wxResult.openid, nickName: '', avatarUrl: '', phoneNumber: null, status: 'active' };
  }

  return withOperationLock(env, `user:${user.id}:session`, async () => {
    const currentStatus = await env.DB.prepare('SELECT status FROM users WHERE id = ?')
      .bind(user.id).first<string>('status');
    if (currentStatus === 'suspended') {
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', '账号已停用，请联系平台管理员');
    }
    const token = generateSecret(32);
    const tokenHash = await sha256Hex(token);
    const sessionId = crypto.randomUUID();
    const expiresAt = now + SESSION_TTL_MS;
    await env.DB.prepare(`
      INSERT INTO user_sessions (id, userId, tokenHash, createdAt, expiresAt, lastSeenAt, userAgent, appVersion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId, user.id, tokenHash, now, expiresAt, now,
      request.headers.get('User-Agent'), request.headers.get('X-App-Version'),
    ).run();
    return json({ openid: user.openid, token, expiresIn: SESSION_TTL_MS / 1000, user });
  });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await env.DB.prepare('UPDATE user_sessions SET revokedAt = ? WHERE id = ?')
    .bind(Date.now(), auth.sessionId).run();
  return json({ success: true });
}

async function getInfo(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const user = await env.DB.prepare(`
    SELECT id, openid, nickName, avatarUrl, gender, country, province, city, language, phoneNumber, createTime, updateTime
    FROM users WHERE id = ?
  `).bind(auth.user.id).first<Record<string, unknown>>();
  const families = await env.DB.prepare(`
    SELECT f.id, f.name, f.timezone, fm.role
    FROM family_members fm JOIN families f ON f.id = fm.familyId
    WHERE fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
    ORDER BY fm.joinedAt ASC
  `).bind(auth.user.id).all();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  return json({
    ...user,
    avatarUrl: await avatarForResponse(request, env, auth.user.id, user.avatarUrl),
    families: families.results,
  });
}

async function updateInfo(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<Record<string, unknown>>(request);
  const allowed = new Set(['nickName', 'avatarUrl', 'gender', 'country', 'province', 'city', 'language']);
  const rejected = Object.keys(body).filter(key => !allowed.has(key));
  if (rejected.length) {
    throw new ApiError(400, 'PROFILE_FIELD_FORBIDDEN', '资料包含不可修改字段', { fields: rejected });
  }
  const current = await env.DB.prepare(`
    SELECT id, openid, nickName, avatarUrl, gender, country, province, city, language, phoneNumber
    FROM users WHERE id = ?
  `).bind(auth.user.id).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');

  const next = {
    nickName: typeof body.nickName === 'string' ? body.nickName.trim().slice(0, 40) : current.nickName,
    avatarUrl: typeof body.avatarUrl === 'string'
      ? await avatarForStorage(env, auth.user.id, body.avatarUrl)
      : current.avatarUrl,
    gender: typeof body.gender === 'number' && [0, 1, 2].includes(body.gender) ? body.gender : current.gender,
    country: typeof body.country === 'string' ? body.country.trim().slice(0, 40) : current.country,
    province: typeof body.province === 'string' ? body.province.trim().slice(0, 40) : current.province,
    city: typeof body.city === 'string' ? body.city.trim().slice(0, 40) : current.city,
    language: typeof body.language === 'string' ? body.language.trim().slice(0, 20) : current.language,
  };
  const hasField = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
  const updateTime = Date.now();
  await env.DB.prepare(`
    UPDATE users SET
      nickName = CASE WHEN ? = 1 THEN ? ELSE nickName END,
      avatarUrl = CASE WHEN ? = 1 THEN ? ELSE avatarUrl END,
      gender = CASE WHEN ? = 1 THEN ? ELSE gender END,
      country = CASE WHEN ? = 1 THEN ? ELSE country END,
      province = CASE WHEN ? = 1 THEN ? ELSE province END,
      city = CASE WHEN ? = 1 THEN ? ELSE city END,
      language = CASE WHEN ? = 1 THEN ? ELSE language END,
      updateTime = ?
    WHERE id = ?
  `).bind(
    hasField('nickName') ? 1 : 0, next.nickName,
    hasField('avatarUrl') ? 1 : 0, next.avatarUrl,
    hasField('gender') ? 1 : 0, next.gender,
    hasField('country') ? 1 : 0, next.country,
    hasField('province') ? 1 : 0, next.province,
    hasField('city') ? 1 : 0, next.city,
    hasField('language') ? 1 : 0, next.language,
    updateTime, auth.user.id,
  ).run();
  const updated = await env.DB.prepare(`
    SELECT id, openid, nickName, avatarUrl, gender, country, province, city, language, phoneNumber, createTime, updateTime
    FROM users WHERE id = ?
  `).bind(auth.user.id).first<Record<string, unknown>>();
  if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  return json({
    ...updated,
    avatarUrl: await avatarForResponse(request, env, auth.user.id, updated.avatarUrl),
  });
}

async function exportAccount(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const [profile, preferences, families, appointments, diners, reviews, inventory, files] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, nickName, avatarUrl, gender, country, province, city, language, phoneNumber, createTime, updateTime
      FROM users WHERE id = ?
    `).bind(auth.user.id),
    env.DB.prepare(`SELECT type, value, severity, createdAt, updatedAt FROM user_food_preferences WHERE userId = ? ORDER BY createdAt`).bind(auth.user.id),
    env.DB.prepare(`
      SELECT f.id, f.name, f.timezone, fm.role, fm.status, fm.joinedAt, fm.updatedAt
      FROM family_members fm JOIN families f ON f.id = fm.familyId WHERE fm.userId = ? ORDER BY fm.joinedAt
    `).bind(auth.user.id),
    env.DB.prepare(`
      SELECT id, familyId, date, mealType, status, remarks, preferenceWarnings, warningsAcknowledged, createTime, updateTime
      FROM appointments WHERE userId = ? ORDER BY createTime
    `).bind(auth.user.id),
    env.DB.prepare(`
      SELECT ad.appointmentId, ad.preferenceSnapshot, ad.createdAt
      FROM appointment_diners ad WHERE ad.userId = ? ORDER BY ad.createdAt
    `).bind(auth.user.id),
    env.DB.prepare(`
      SELECT id, familyId, appointmentId, dishId, rating, content, images, createTime, updateTime
      FROM reviews WHERE userId = ? ORDER BY createTime
    `).bind(auth.user.id),
    env.DB.prepare(`
      SELECT id, familyId, name, amount, quantity, unit, category, status, putInDate, expiryDate, remarks, createTime, updateTime
      FROM inventory_items WHERE userId = ? ORDER BY createTime
    `).bind(auth.user.id),
    env.DB.prepare(`
      SELECT id, familyId, name, contentType, size, purpose, createdAt, deletedAt
      FROM family_files WHERE uploadedBy = ? ORDER BY createdAt
    `).bind(auth.user.id),
  ]);
  return json({
    exportedAt: new Date().toISOString(),
    profile: profile.results[0] || null,
    preferences: preferences.results,
    families: families.results,
    appointments: appointments.results,
    appointmentDiningHistory: diners.results,
    reviews: reviews.results,
    inventoryContributions: inventory.results,
    files: files.results,
  });
}

async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<{ confirm?: unknown }>(request);
  if (body.confirm !== true) throw new ApiError(400, 'ACCOUNT_DELETE_CONFIRM_REQUIRED', '请明确确认注销账号');
  return withOperationLock(env, `user:${auth.user.id}:account`, async () => {
    const owned = await env.DB.prepare(`
      SELECT f.id, f.name FROM family_members fm JOIN families f ON f.id = fm.familyId
      WHERE fm.userId = ? AND fm.role = 'owner' AND fm.status = 'active' AND f.status = 'active'
      ORDER BY f.createdAt
    `).bind(auth.user.id).all<{ id: string; name: string }>();
    if (owned.results.length) {
      throw new ApiError(409, 'OWNER_TRANSFER_REQUIRED', '请先转让或解散名下家庭后再注销账号', {
        families: owned.results,
      });
    }

    const now = Date.now();
    const anonymizedOpenid = `deleted:${auth.user.id}:${now}`;
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        VALUES (?, NULL, ?, 'user.account_deleted', 'user', ?, ?, ?)
      `).bind(crypto.randomUUID(), auth.user.id, auth.user.id, JSON.stringify({ anonymized: true }), now),
      env.DB.prepare('UPDATE user_sessions SET revokedAt = COALESCE(revokedAt, ?) WHERE userId = ?').bind(now, auth.user.id),
      env.DB.prepare('DELETE FROM login_info WHERE openid = ?').bind(auth.user.openid),
      env.DB.prepare('DELETE FROM user_phones WHERE userId = ? OR openid = ?').bind(auth.user.id, auth.user.openid),
      env.DB.prepare('DELETE FROM user_food_preferences WHERE userId = ?').bind(auth.user.id),
      env.DB.prepare(`
        UPDATE family_members SET status = 'left', updatedAt = ?
        WHERE userId = ? AND status = 'active' AND role != 'owner'
      `).bind(now, auth.user.id),
      env.DB.prepare(`
        UPDATE family_invitations SET revokedAt = COALESCE(revokedAt, ?)
        WHERE createdBy = ? AND acceptedAt IS NULL
      `).bind(now, auth.user.id),
      env.DB.prepare(`
        UPDATE users SET openid = ?, nickName = '已注销用户', avatarUrl = '', gender = 0,
          country = '', province = '', city = '', language = 'zh_CN', phoneNumber = NULL,
          isAdmin = 0, updateTime = ? WHERE id = ?
      `).bind(anonymizedOpenid, now, auth.user.id),
    ]);
    return json({ success: true, deletedAt: now });
  });
}

async function adminStatus(request: Request, env: Env): Promise<Response> {
  try {
    const context = await requireFamilyContext(request, env);
    return json({ isAdmin: context.role === 'owner' || context.role === 'admin', role: context.role, familyId: context.familyId });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NO_FAMILY') return json({ isAdmin: false, role: null, familyId: null });
    throw error;
  }
}

async function listUsers(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const result = await env.DB.prepare(`
    SELECT u.id, u.nickName, u.avatarUrl, fm.role
    FROM family_members fm JOIN users u ON u.id = fm.userId
    WHERE fm.familyId = ? AND fm.status = 'active'
    ORDER BY fm.joinedAt ASC
  `).bind(context.familyId).all();
  return json({ total: result.results.length, list: result.results });
}

async function getPhone(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await checkRateLimit(env, `phone:${auth.user.id}`, 10, 60 * 60 * 1000);
  const body = await readJson<{ code?: unknown }>(request);
  const code = requiredString(body.code, '手机号凭证', 256);
  const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`);
  const tokenResult = await tokenResponse.json<{ access_token?: string; errmsg?: string }>();
  if (!tokenResult.access_token) throw new ApiError(502, 'WECHAT_API_ERROR', tokenResult.errmsg || '获取微信凭证失败');
  const phoneResponse = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenResult.access_token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  });
  const result = await phoneResponse.json<{
    errcode?: number; errmsg?: string;
    phone_info?: { phoneNumber: string; purePhoneNumber: string; countryCode: string };
  }>();
  if (result.errcode !== 0 || !result.phone_info) throw new ApiError(502, 'WECHAT_PHONE_FAILED', result.errmsg || '获取手机号失败');
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO user_phones (id, userId, openid, phoneNumber, purePhoneNumber, countryCode, createTime)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), auth.user.id, auth.user.openid, result.phone_info.phoneNumber,
      result.phone_info.purePhoneNumber, result.phone_info.countryCode, now,
    ),
    env.DB.prepare('UPDATE users SET phoneNumber = ?, updateTime = ? WHERE id = ?')
      .bind(result.phone_info.phoneNumber, now, auth.user.id),
  ]);
  return json(result.phone_info);
}

async function updateAvatar(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  await checkRateLimit(env, `avatar:${context.user.id}`, 20, 60 * 60 * 1000);
  const contentLength = Number(request.headers.get('Content-Length') || '0');
  const maxBytes = Math.min(10 * 1024 * 1024, Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024));
  if (contentLength > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', '头像文件过大');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', '请选择头像文件');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxBytes) {
    throw new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', '仅支持 JPG、PNG 或 WebP 图片');
  }
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const objectKey = `families/${context.familyId}/avatars/${context.user.id}/${crypto.randomUUID()}.${extension}`;
  await env.FILE_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
  const fileId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO family_files (id, familyId, objectKey, name, contentType, size, purpose, uploadedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'avatar', ?, ?)
    `).bind(fileId, context.familyId, objectKey, file.name || `avatar.${extension}`, file.type, file.size, context.user.id, now),
    env.DB.prepare('UPDATE users SET avatarUrl = ?, updateTime = ? WHERE id = ?')
      .bind(`/api/file/download?id=${fileId}`, now, context.user.id),
  ]);
  await writeAudit(env, context, 'user.avatar_updated', 'file', fileId);
  const filePath = createStableFilePath(fileId);
  const url = await createAbsoluteFileAccessUrl(request, env, fileId, context.familyId);
  return json({ id: fileId, avatarUrl: url, filePath, url });
}

export async function handleUserV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'POST /api/user/login': return login(request, env);
    case 'POST /api/user/logout': return logout(request, env);
    case 'GET /api/user/info': return getInfo(request, env);
    case 'PUT /api/user/info': return updateInfo(request, env);
    case 'GET /api/user/admin': return adminStatus(request, env);
    case 'GET /api/user/list': return listUsers(request, env);
    case 'POST /api/user/phone': return getPhone(request, env);
    case 'POST /api/user/avatar': return updateAvatar(request, env);
    case 'GET /api/user/export': return exportAccount(request, env);
    case 'DELETE /api/user/account': return deleteAccount(request, env);
    case 'POST /api/user/profile':
    case 'POST /api/user/phone/wx':
      throw new ApiError(410, 'LEGACY_ENDPOINT_DISABLED', '旧版未认证接口已停用，请升级小程序');
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
