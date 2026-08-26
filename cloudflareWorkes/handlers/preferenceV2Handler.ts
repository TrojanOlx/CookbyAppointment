import { requireAuth } from '../core/auth';
import { ApiError, json, readJson } from '../core/http';
import type { Env } from '../core/types';
import { strictTextArray } from '../core/validation';

type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot';
const SPICE_ALIASES: Record<string, SpiceLevel> = {
  none: 'none', mild: 'mild', medium: 'medium', hot: 'hot',
  '不辣': 'none', '微辣': 'mild', '中辣': 'medium', '特辣': 'hot',
};

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  return Array.from(new Set(strictTextArray(value, field, 20, 20)));
}

async function getPreferences(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(`
    SELECT id, type, value, severity, createdAt, updatedAt
    FROM user_food_preferences WHERE userId = ? ORDER BY type, createdAt
  `).bind(auth.user.id).all<{ id: string; type: string; value: string; severity: string; createdAt: number; updatedAt: number }>();
  const preferences = result.results;
  return json({
    allergies: preferences.filter(item => item.type === 'allergy').map(item => item.value),
    dislikes: preferences.filter(item => item.type === 'avoid').map(item => item.value),
    likes: preferences.filter(item => item.type === 'like').map(item => item.value),
    spicyLevel: preferences.find(item => item.type === 'spice')?.value || 'none',
    preferences,
  });
}

async function updatePreferences(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<{
    allergies?: unknown; dislikes?: unknown; likes?: unknown; spicyLevel?: unknown;
  }>(request);
  const allergies = stringArray(body.allergies, '过敏标签');
  const dislikes = stringArray(body.dislikes, '忌口标签');
  const likes = stringArray(body.likes, '喜好标签');
  const spiceRaw = typeof body.spicyLevel === 'string' ? body.spicyLevel : 'none';
  const spicyLevel = SPICE_ALIASES[spiceRaw];
  if (!spicyLevel) throw new ApiError(400, 'VALIDATION_ERROR', '辣度偏好无效');
  const now = Date.now();
  const entries = [
    ...allergies.map(value => ({ type: 'allergy', value })),
    ...dislikes.map(value => ({ type: 'avoid', value })),
    ...likes.map(value => ({ type: 'like', value })),
    { type: 'spice', value: spicyLevel },
  ];
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_food_preferences WHERE userId = ?').bind(auth.user.id),
    ...entries.map(entry => env.DB.prepare(`
      INSERT INTO user_food_preferences (id, userId, type, value, severity, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'warning', ?, ?)
    `).bind(crypto.randomUUID(), auth.user.id, entry.type, entry.value, now, now)),
  ]);
  return json({ allergies, dislikes, likes, spicyLevel, preferences: entries });
}

export async function handlePreferenceV2(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return getPreferences(request, env);
  if (request.method === 'PUT') return updatePreferences(request, env);
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
}
