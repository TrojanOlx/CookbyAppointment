import { ApiError } from './http';
import { hasCapability, type Capability } from './domain';
import type { AuthContext, Env, FamilyContext, FamilyRole, UserRow } from './types';

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录');
  return match[1];
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const tokenHash = await sha256Hex(bearerToken(request));
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT s.id AS sessionId, s.revokedAt, s.expiresAt,
      u.id, u.openid, u.nickName, u.avatarUrl, u.phoneNumber, u.status
    FROM user_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
  `).bind(tokenHash).first<UserRow & { sessionId: string; revokedAt: number | null; expiresAt: number }>();
  if (!row) throw new ApiError(401, 'SESSION_INVALID', '登录已过期，请重新登录');
  if (row.status === 'suspended') throw new ApiError(403, 'ACCOUNT_SUSPENDED', '账号已停用，请联系平台管理员');
  if (row.revokedAt !== null || row.expiresAt <= now) {
    throw new ApiError(401, 'SESSION_INVALID', '登录已过期，请重新登录');
  }

  await env.DB.prepare('UPDATE user_sessions SET lastSeenAt = ? WHERE id = ?')
    .bind(now, row.sessionId).run();
  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      openid: row.openid,
      nickName: row.nickName,
      avatarUrl: row.avatarUrl,
      phoneNumber: row.phoneNumber,
      status: row.status,
    },
  };
}

export async function requireFamilyContext(request: Request, env: Env): Promise<FamilyContext> {
  const auth = await requireAuth(request, env);
  let familyId = request.headers.get('X-Family-Id')?.trim() || '';

  if (!familyId) {
    const memberships = await env.DB.prepare(`
      SELECT fm.familyId FROM family_members fm
      JOIN families f ON f.id = fm.familyId
      WHERE fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
      ORDER BY fm.joinedAt ASC LIMIT 2
    `).bind(auth.user.id).all<{ familyId: string }>();
    if (memberships.results.length === 0) {
      throw new ApiError(409, 'NO_FAMILY', '请先创建或加入家庭');
    }
    if (memberships.results.length > 1) {
      throw new ApiError(400, 'FAMILY_CONTEXT_REQUIRED', '请选择当前家庭');
    }
    familyId = memberships.results[0].familyId;
  }

  const membership = await env.DB.prepare(`
    SELECT fm.role, f.name AS familyName, f.timezone
    FROM family_members fm
    JOIN families f ON f.id = fm.familyId
    WHERE fm.familyId = ? AND fm.userId = ?
      AND fm.status = 'active' AND f.status = 'active'
  `).bind(familyId, auth.user.id).first<{ role: FamilyRole; familyName: string; timezone: string }>();
  if (!membership) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '无权访问该家庭');
  return { ...auth, familyId, ...membership };
}

export function requireCapability(context: FamilyContext, capability: Capability): void {
  if (!hasCapability(context.role, capability)) {
    throw new ApiError(403, 'ROLE_FORBIDDEN', '当前家庭角色无权执行此操作', { role: context.role, capability });
  }
}

export async function writeAudit(
  env: Env,
  context: Pick<FamilyContext, 'familyId' | 'user'>,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: unknown,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), context.familyId, context.user.id, action,
    targetType || null, targetId || null, details === undefined ? null : JSON.stringify(details), Date.now(),
  ).run();
}

export async function checkRateLimit(env: Env, scope: string, limit: number, windowMs = 60_000): Promise<void> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  await env.DB.prepare(`
    INSERT INTO api_rate_limits (scope, windowStart, count) VALUES (?, ?, 1)
    ON CONFLICT(scope, windowStart) DO UPDATE SET count = count + 1
  `).bind(scope, windowStart).run();
  const count = await env.DB.prepare('SELECT count FROM api_rate_limits WHERE scope = ? AND windowStart = ?')
    .bind(scope, windowStart).first<number>('count');
  if ((count || 0) > limit) throw new ApiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
}
