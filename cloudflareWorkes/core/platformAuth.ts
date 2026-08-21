import { requireAuth } from './auth';
import { ApiError } from './http';
import type { AuthContext, Env } from './types';

export interface PlatformAdminContext extends AuthContext {
  platformRole: 'super_admin';
}

export async function platformAdminStatus(request: Request, env: Env): Promise<{
  auth: AuthContext;
  isPlatformAdmin: boolean;
  platformRole: 'super_admin' | null;
}> {
  const auth = await requireAuth(request, env);
  const admin = await env.DB.prepare(`
    SELECT role FROM platform_admins
    WHERE userId = ? AND status = 'active'
  `).bind(auth.user.id).first<{ role: 'super_admin' }>();
  return { auth, isPlatformAdmin: Boolean(admin), platformRole: admin?.role || null };
}

export async function requirePlatformAdmin(request: Request, env: Env): Promise<PlatformAdminContext> {
  const status = await platformAdminStatus(request, env);
  if (!status.isPlatformAdmin || !status.platformRole) {
    throw new ApiError(403, 'PLATFORM_ADMIN_REQUIRED', '仅平台管理员可以执行此操作');
  }
  return { ...status.auth, platformRole: status.platformRole };
}

export async function writePlatformAudit(
  env: Env,
  context: PlatformAdminContext,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: unknown,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), context.user.id, action, targetType || null, targetId || null,
    details === undefined ? null : JSON.stringify(details), Date.now(),
  ).run();
}
