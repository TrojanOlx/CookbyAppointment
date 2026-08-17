import { ApiError } from './http';
import type { Env } from './types';

const LOCK_LEASE_MS = 2 * 60 * 1000;

export async function withOperationLock<T>(
  env: Env,
  scope: string,
  execute: () => Promise<T>,
): Promise<T> {
  const token = crypto.randomUUID();
  const deadline = Date.now() + 2000;
  let claimed = false;
  while (!claimed) {
    const now = Date.now();
    const result = await env.DB.prepare(`
      INSERT INTO operation_locks (scope, token, expiresAt) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET token = excluded.token, expiresAt = excluded.expiresAt
      WHERE operation_locks.expiresAt <= ?
    `).bind(scope, token, now + LOCK_LEASE_MS, now).run();
    claimed = Boolean(result.meta.changes);
    if (claimed) break;
    if (Date.now() >= deadline) {
      throw new ApiError(409, 'OPERATION_IN_PROGRESS', '相同资源正在处理中，请稍后重试');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  try {
    return await execute();
  } finally {
    try {
      await env.DB.prepare('DELETE FROM operation_locks WHERE scope = ? AND token = ?')
        .bind(scope, token).run();
    } catch (error) {
      console.error(JSON.stringify({
        message: 'operation_lock.release_failed', scope,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
}
