import { checkRateLimit, generateSecret, requireAuth, requireCapability, requireFamilyContext, sha256Hex, writeAudit } from '../core/auth';
import { canManageRole } from '../core/domain';
import { ApiError, json, readJson, requiredString } from '../core/http';
import { userLifecycleLockScope, withOperationLock } from '../core/operationLock';
import {
  buildFreezeMealContributionsForMemberStatements,
  buildFreezeMealRecordsForFamilyStatements,
} from '../core/mealHistory';
import type { Env, FamilyRole } from '../core/types';
import { strictText, strictTimezone } from '../core/validation';

const VALID_ROLES = new Set<FamilyRole>(['owner', 'admin', 'chef', 'member']);

function inviteHours(env: Env): number {
  return Math.min(168, Math.max(1, Number(env.INVITE_TTL_HOURS || 72)));
}

function memberLimit(env: Env): number {
  return Math.min(100, Math.max(1, Number(env.FAMILY_MEMBER_LIMIT || 20)));
}

async function listFamilies(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`
    SELECT f.id, f.name, f.timezone, f.memberLimit, fm.role, fm.joinedAt,
      (SELECT COUNT(*) FROM family_members active
       WHERE active.familyId = f.id AND active.status = 'active') AS memberCount
    FROM family_members fm
    JOIN families f ON f.id = fm.familyId
    WHERE fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
    ORDER BY fm.joinedAt ASC
  `).bind(auth.user.id).all();
  return json({ list: result.results });
}

async function createFamily(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await checkRateLimit(env, `family-create:${auth.user.id}`, 5, 60 * 60 * 1000);
  const data = await readJson<{ name?: unknown; timezone?: unknown }>(request);
  const name = strictText(data.name, '家庭名称', 32, { required: true, meaningfulName: true });
  const timezone = strictTimezone(data.timezone, env.DEFAULT_TIMEZONE || 'Asia/Shanghai');
  const id = crypto.randomUUID();
  const now = Date.now();
  return withOperationLock(env, userLifecycleLockScope(auth.user.id), async () => {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO families (id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `).bind(id, name, timezone, memberLimit(env), auth.user.id, now, now),
      env.DB.prepare(`
        INSERT INTO family_members (familyId, userId, role, status, joinedAt, updatedAt)
        VALUES (?, ?, 'owner', 'active', ?, ?)
      `).bind(id, auth.user.id, now, now),
      env.DB.prepare(`
        INSERT INTO shopping_lists (id, familyId, status, createdAt, updatedAt)
        VALUES (?, ?, 'active', ?, ?)
      `).bind(crypto.randomUUID(), id, now, now),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, createdAt)
        VALUES (?, ?, ?, 'family.created', 'family', ?, ?)
      `).bind(crypto.randomUUID(), id, auth.user.id, id, now),
    ]);
    return json({ id, name, timezone, memberLimit: memberLimit(env), role: 'owner', needsRecipeSetup: true }, 201);
  });
}

async function getFamily(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const family = await env.DB.prepare(`
    SELECT f.id, f.name, f.timezone, f.memberLimit, f.createdAt, f.updatedAt,
      fm.role,
      (SELECT COUNT(*) FROM family_members m WHERE m.familyId = f.id AND m.status = 'active') AS memberCount
    FROM families f JOIN family_members fm ON fm.familyId = f.id
    WHERE f.id = ? AND fm.userId = ? AND fm.status = 'active'
  `).bind(context.familyId, context.user.id).first();
  return json(family);
}

async function updateFamily(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.manage');
  const data = await readJson<{ name?: unknown; timezone?: unknown }>(request);
  const name = strictText(data.name, '家庭名称', 32, { required: true, meaningfulName: true });
  const timezone = strictTimezone(data.timezone, context.timezone);
  const now = Date.now();
  await env.DB.prepare('UPDATE families SET name = ?, timezone = ?, updatedAt = ? WHERE id = ? AND status = ?')
    .bind(name, timezone, now, context.familyId, 'active').run();
  await writeAudit(env, context, 'family.updated', 'family', context.familyId, { name, timezone });
  return json({ id: context.familyId, name, timezone });
}

async function dissolveFamily(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  return withOperationLock(env, `family:${context.familyId}:membership`, async () => {
    const actor = await env.DB.prepare(`
      SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'
    `).bind(context.familyId, context.user.id).first<{ role: FamilyRole }>();
    if (actor?.role !== 'owner') throw new ApiError(403, 'OWNER_REQUIRED', '仅家庭主可以解散家庭');
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`UPDATE families SET status = 'dissolved', dissolvedAt = ?, updatedAt = ? WHERE id = ? AND status = 'active'`)
        .bind(now, now, context.familyId),
      env.DB.prepare('UPDATE family_invitations SET revokedAt = ? WHERE familyId = ? AND revokedAt IS NULL AND acceptedAt IS NULL')
        .bind(now, context.familyId),
      env.DB.prepare(`UPDATE shopping_lists SET status = 'archived', updatedAt = ? WHERE familyId = ? AND status = 'active'`)
        .bind(now, context.familyId),
      ...buildFreezeMealRecordsForFamilyStatements(env, context.familyId, now),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, createdAt)
        VALUES (?, ?, ?, 'family.dissolved', 'family', ?, ?)
      `).bind(crypto.randomUUID(), context.familyId, context.user.id, context.familyId, now),
    ]);
    return json({ success: true });
  });
}

async function listMembers(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const result = await env.DB.prepare(`
    SELECT u.id AS userId, u.nickName, u.avatarUrl, fm.role, fm.joinedAt,
      uas.pinnedAchievementId
    FROM family_members fm JOIN users u ON u.id = fm.userId
    LEFT JOIN user_achievement_state uas ON uas.userId = u.id
    WHERE fm.familyId = ? AND fm.status = 'active'
    ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'chef' THEN 2 ELSE 3 END,
      fm.joinedAt ASC
  `).bind(context.familyId).all();
  return json({ list: result.results, currentUserId: context.user.id, currentRole: context.role });
}

async function createInvitation(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.invite');
  await checkRateLimit(env, `family-invite:${context.user.id}`, 20, 60 * 60 * 1000);
  const data = await readJson<{ role?: unknown }>(request);
  const role = data.role as FamilyRole;
  if (!VALID_ROLES.has(role) || role === 'owner') {
    throw new ApiError(400, 'INVALID_ROLE', '邀请角色无效');
  }
  if (role === 'admin' && context.role !== 'owner') {
    throw new ApiError(403, 'OWNER_REQUIRED', '仅家庭主可以邀请管理员');
  }
  const token = generateSecret(16);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + inviteHours(env) * 60 * 60 * 1000;
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO family_invitations (id, familyId, role, tokenHash, createdBy, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, context.familyId, role, tokenHash, context.user.id, now, expiresAt).run();
  await writeAudit(env, context, 'invitation.created', 'invitation', id, { role, expiresAt });
  return json({ id, token, role, expiresAt, path: `/pages/family/invite/invite?token=${token}` }, 201);
}

async function previewInvitation(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const token = strictText(new URL(request.url).searchParams.get('token'), '邀请令牌', 128, { required: true });
  const tokenHash = await sha256Hex(token);
  const invite = await env.DB.prepare(`
    SELECT i.id, i.familyId, i.role, i.expiresAt, i.revokedAt, i.acceptedAt,
      f.name AS familyName,
      (SELECT COUNT(*) FROM family_members m WHERE m.familyId = f.id AND m.status = 'active') AS memberCount,
      f.memberLimit
    FROM family_invitations i JOIN families f ON f.id = i.familyId
    WHERE i.tokenHash = ? AND f.status = 'active'
  `).bind(tokenHash).first<Record<string, unknown>>();
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', '邀请不存在');
  const status = invite.revokedAt ? 'revoked'
    : invite.acceptedAt ? 'accepted'
      : Number(invite.expiresAt) <= Date.now() ? 'expired' : 'active';
  const membership = await env.DB.prepare(`
    SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'
  `).bind(invite.familyId, auth.user.id).first();
  return json({ ...invite, status, alreadyMember: Boolean(membership), currentRole: membership?.role || null });
}

async function acceptInvitation(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await checkRateLimit(env, `invite-accept:${auth.user.id}`, 30, 60 * 60 * 1000);
  const data = await readJson<{ token?: unknown }>(request);
  const token = strictText(data.token, '邀请令牌', 128, { required: true });
  const tokenHash = await sha256Hex(token);
  const invitation = await env.DB.prepare(`
    SELECT i.familyId FROM family_invitations i JOIN families f ON f.id = i.familyId
    WHERE i.tokenHash = ? AND f.status = 'active'
  `).bind(tokenHash).first<{ familyId: string }>();
  if (!invitation) throw new ApiError(404, 'INVITE_NOT_FOUND', '邀请不存在');

  return withOperationLock(env, `family:${invitation.familyId}:membership`, async () => {
    const now = Date.now();
    const invite = await env.DB.prepare(`
      SELECT i.id, i.familyId, i.role, i.expiresAt, i.revokedAt, i.acceptedAt, i.acceptedBy,
        f.name AS familyName, f.memberLimit,
        (SELECT COUNT(*) FROM family_members m WHERE m.familyId = i.familyId AND m.status = 'active') AS memberCount
      FROM family_invitations i JOIN families f ON f.id = i.familyId
      WHERE i.tokenHash = ? AND f.status = 'active'
    `).bind(tokenHash).first<{
      id: string; familyId: string; role: FamilyRole; expiresAt: number; revokedAt: number | null;
      acceptedAt: number | null; acceptedBy: string | null; familyName: string; memberLimit: number; memberCount: number;
    }>();
    if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', '邀请不存在');

    const existing = await env.DB.prepare(`
      SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'
    `).bind(invite.familyId, auth.user.id).first<{ role: FamilyRole }>();
    if (existing) return json({ familyId: invite.familyId, familyName: invite.familyName, role: existing.role, alreadyJoined: true });
    if (invite.revokedAt) throw new ApiError(410, 'INVITE_REVOKED', '邀请已撤销');
    if (invite.expiresAt <= now) throw new ApiError(410, 'INVITE_EXPIRED', '邀请已过期');
    if (invite.acceptedAt) throw new ApiError(409, 'INVITE_USED', '邀请已被使用');
    if (invite.memberCount >= invite.memberLimit) throw new ApiError(409, 'FAMILY_MEMBER_LIMIT', '家庭成员人数已达上限');

    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE family_invitations SET acceptedAt = ?, acceptedBy = ?
        WHERE id = ? AND acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?
      `).bind(now, auth.user.id, invite.id, now),
      env.DB.prepare(`
        INSERT INTO family_members (familyId, userId, role, status, joinedAt, updatedAt)
        SELECT ?, ?, ?, 'active', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM family_invitations
          WHERE id = ? AND acceptedAt = ? AND acceptedBy = ?
        )
        ON CONFLICT(familyId, userId) DO UPDATE SET
          role = excluded.role, status = 'active', joinedAt = excluded.joinedAt, updatedAt = excluded.updatedAt
      `).bind(invite.familyId, auth.user.id, invite.role, now, now, invite.id, now, auth.user.id),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        SELECT ?, ?, ?, 'invitation.accepted', 'invitation', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM family_invitations
          WHERE id = ? AND acceptedAt = ? AND acceptedBy = ?
        )
      `).bind(
        crypto.randomUUID(), invite.familyId, auth.user.id, invite.id,
        JSON.stringify({ role: invite.role }), now, invite.id, now, auth.user.id,
      ),
    ]);
    if (!results[0].meta.changes) throw new ApiError(409, 'INVITE_USED', '邀请已被使用');
    return json({ familyId: invite.familyId, familyName: invite.familyName, role: invite.role, alreadyJoined: false });
  });
}

async function revokeInvitation(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.invite');
  const data = await readJson<{ invitationId?: unknown }>(request);
  const invitationId = requiredString(data.invitationId, '邀请ID');
  return withOperationLock(env, `family:${context.familyId}:membership`, async () => {
    const result = await env.DB.prepare(`
      UPDATE family_invitations SET revokedAt = ?
      WHERE id = ? AND familyId = ? AND acceptedAt IS NULL AND revokedAt IS NULL
    `).bind(Date.now(), invitationId, context.familyId).run();
    if (!result.meta.changes) throw new ApiError(404, 'INVITE_NOT_ACTIVE', '未找到可撤销的邀请');
    await writeAudit(env, context, 'invitation.revoked', 'invitation', invitationId);
    return json({ success: true });
  });
}

async function updateMemberRole(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.manage');
  const data = await readJson<{ userId?: unknown; role?: unknown }>(request);
  const userId = requiredString(data.userId, '用户ID');
  const role = data.role as FamilyRole;
  if (!VALID_ROLES.has(role) || role === 'owner') throw new ApiError(400, 'INVALID_ROLE', '成员角色无效');
  return withOperationLock(env, `family:${context.familyId}:membership`, async () => {
    const [actor, target] = await Promise.all([
      env.DB.prepare(`SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
        .bind(context.familyId, context.user.id).first<{ role: FamilyRole }>(),
      env.DB.prepare(`SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
        .bind(context.familyId, userId).first<{ role: FamilyRole }>(),
    ]);
    if (!actor) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '已不再是该家庭成员');
    if (!target) throw new ApiError(404, 'MEMBER_NOT_FOUND', '家庭成员不存在');
    if (!canManageRole(actor.role, target.role, role)) throw new ApiError(403, 'ROLE_FORBIDDEN', '不能调整该成员的角色');
    const updated = await env.DB.prepare(`
      UPDATE family_members SET role = ?, updatedAt = ?
      WHERE familyId = ? AND userId = ? AND status = 'active' AND role = ?
    `).bind(role, Date.now(), context.familyId, userId, target.role).run();
    if (!updated.meta.changes) throw new ApiError(409, 'MEMBERSHIP_CHANGED', '成员状态已变化，请刷新后重试');
    await writeAudit(env, context, 'member.role_changed', 'user', userId, { from: target.role, to: role });
    return json({ userId, role });
  });
}

async function removeMember(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.manage');
  const userId = new URL(request.url).searchParams.get('userId') || '';
  if (!userId) throw new ApiError(400, 'VALIDATION_ERROR', '缺少用户ID');
  if (userId === context.user.id) throw new ApiError(400, 'USE_LEAVE_FAMILY', '请使用退出家庭功能');
  return withOperationLock(env, `family:${context.familyId}:membership`, async () => {
    const [actor, target] = await Promise.all([
      env.DB.prepare(`SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
        .bind(context.familyId, context.user.id).first<{ role: FamilyRole }>(),
      env.DB.prepare(`SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
        .bind(context.familyId, userId).first<{ role: FamilyRole }>(),
    ]);
    if (!actor) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '已不再是该家庭成员');
    if (!target) throw new ApiError(404, 'MEMBER_NOT_FOUND', '家庭成员不存在');
    if (!canManageRole(actor.role, target.role)) throw new ApiError(403, 'ROLE_FORBIDDEN', '不能移除该成员');
    const now = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE family_members SET status = 'removed', updatedAt = ?
        WHERE familyId = ? AND userId = ? AND status = 'active' AND role = ?
      `).bind(now, context.familyId, userId, target.role),
      ...buildFreezeMealContributionsForMemberStatements(env, context.familyId, userId, now),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        VALUES (?, ?, ?, 'member.removed', 'user', ?, ?, ?)
      `).bind(crypto.randomUUID(), context.familyId, context.user.id, userId, JSON.stringify({ role: target.role }), now),
    ]);
    if (!results[0]?.meta.changes) throw new ApiError(409, 'MEMBERSHIP_CHANGED', '成员状态已变化，请刷新后重试');
    return json({ success: true });
  });
}

async function leaveFamily(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  return withOperationLock(env, `family:${context.familyId}:membership`, async () => {
    const member = await env.DB.prepare(`
      SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'
    `).bind(context.familyId, context.user.id).first<{ role: FamilyRole }>();
    if (!member) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '已不再是该家庭成员');
    if (member.role === 'owner') throw new ApiError(409, 'OWNER_TRANSFER_REQUIRED', '家庭主需先转让家庭主身份');
    const now = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE family_members SET status = 'left', updatedAt = ?
        WHERE familyId = ? AND userId = ? AND status = 'active' AND role <> 'owner'
      `).bind(now, context.familyId, context.user.id),
      ...buildFreezeMealContributionsForMemberStatements(env, context.familyId, context.user.id, now),
      env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, createdAt)
        VALUES (?, ?, ?, 'member.left', 'user', ?, ?)
      `).bind(crypto.randomUUID(), context.familyId, context.user.id, context.user.id, now),
    ]);
    if (!results[0]?.meta.changes) throw new ApiError(409, 'MEMBERSHIP_CHANGED', '成员状态已变化，请刷新后重试');
    return json({ success: true });
  });
}

async function transferOwnership(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const data = await readJson<{ userId?: unknown }>(request);
  const userId = requiredString(data.userId, '用户ID');
  if (userId === context.user.id) throw new ApiError(400, 'VALIDATION_ERROR', '不能转让给自己');
  return withOperationLock(env, userLifecycleLockScope(userId), () =>
    withOperationLock(env, `family:${context.familyId}:membership`, async () => {
      const [actor, target] = await Promise.all([
        env.DB.prepare(`SELECT role FROM family_members WHERE familyId = ? AND userId = ? AND status = 'active'`)
          .bind(context.familyId, context.user.id).first<{ role: FamilyRole }>(),
        env.DB.prepare(`
          SELECT fm.role, u.status AS userStatus
          FROM family_members fm JOIN users u ON u.id = fm.userId
          WHERE fm.familyId = ? AND fm.userId = ? AND fm.status = 'active'
        `).bind(context.familyId, userId).first<{ role: FamilyRole; userStatus: string }>(),
      ]);
      if (actor?.role !== 'owner') throw new ApiError(403, 'OWNER_REQUIRED', '仅家庭主可以转让家庭');
      if (!target) throw new ApiError(404, 'MEMBER_NOT_FOUND', '接任者必须是当前家庭成员');
      if (target.userStatus !== 'active') throw new ApiError(409, 'ACCOUNT_SUSPENDED', '已停用用户不能接任家庭主');
      const now = Date.now();
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE family_members SET role = 'admin', updatedAt = ? WHERE familyId = ? AND userId = ? AND status = 'active' AND role = 'owner'`)
          .bind(now, context.familyId, context.user.id),
        env.DB.prepare(`UPDATE family_members SET role = 'owner', updatedAt = ? WHERE familyId = ? AND userId = ? AND status = 'active' AND role = ?`)
          .bind(now, context.familyId, userId, target.role),
        env.DB.prepare(`
          INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
          VALUES (?, ?, ?, 'family.owner_transferred', 'user', ?, ?, ?)
        `).bind(crypto.randomUUID(), context.familyId, context.user.id, userId, JSON.stringify({ previousOwnerId: context.user.id }), now),
      ]);
      if (!results[0].meta.changes || !results[1].meta.changes) throw new ApiError(409, 'MEMBERSHIP_CHANGED', '成员状态已变化，请刷新后重试');
      return json({ success: true, ownerId: userId });
    }));
}

async function invitationCode(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await checkRateLimit(env, `invite-code:${auth.user.id}`, 10, 60 * 60 * 1000);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) throw new ApiError(400, 'INVITE_TOKEN_REQUIRED', '缺少邀请令牌');
  const tokenHash = await sha256Hex(token);
  const invitation = await env.DB.prepare(`
    SELECT i.id FROM family_invitations i
    JOIN family_members fm ON fm.familyId = i.familyId
    WHERE i.tokenHash = ? AND fm.userId = ? AND fm.status = 'active'
      AND i.revokedAt IS NULL AND i.acceptedAt IS NULL AND i.expiresAt > ?
  `).bind(tokenHash, auth.user.id, Date.now()).first();
  if (!invitation) throw new ApiError(404, 'INVITE_NOT_ACTIVE', '邀请不可用');
  const accessTokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`);
  const accessTokenData = await accessTokenResponse.json<{ access_token?: string; errmsg?: string }>();
  if (!accessTokenData.access_token) throw new ApiError(502, 'WECHAT_API_ERROR', accessTokenData.errmsg || '获取微信凭证失败');
  const codeResponse = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessTokenData.access_token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene: token, page: 'pages/family/invite/invite', check_path: false, env_version: 'release' }),
  });
  if (!codeResponse.ok || !codeResponse.body) throw new ApiError(502, 'WECHAT_API_ERROR', '生成小程序码失败');
  return new Response(codeResponse.body, { headers: { 'Content-Type': codeResponse.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'no-store' } });
}

export async function handleFamilyV2(request: Request, env: Env, path: string): Promise<Response> {
  const key = `${request.method} ${path}`;
  switch (key) {
    case 'GET /api/family/list': return listFamilies(request, env);
    case 'POST /api/family/create': return createFamily(request, env);
    case 'GET /api/family/detail': return getFamily(request, env);
    case 'PUT /api/family/detail': return updateFamily(request, env);
    case 'DELETE /api/family/detail': return dissolveFamily(request, env);
    case 'GET /api/family/members': return listMembers(request, env);
    case 'POST /api/family/invite': return createInvitation(request, env);
    case 'GET /api/family/invite/preview': return previewInvitation(request, env);
    case 'POST /api/family/invite/accept': return acceptInvitation(request, env);
    case 'POST /api/family/invite/revoke': return revokeInvitation(request, env);
    case 'GET /api/family/invite/code': return invitationCode(request, env);
    case 'PUT /api/family/member/role': return updateMemberRole(request, env);
    case 'DELETE /api/family/member': return removeMember(request, env);
    case 'POST /api/family/leave': return leaveFamily(request, env);
    case 'POST /api/family/transfer': return transferOwnership(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
