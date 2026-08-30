import { requireAuth } from '../core/auth';
import { ApiError, json, readJson } from '../core/http';
import { normalizeImageList } from '../core/media';
import type { Env } from '../core/types';
import {
  achievementDefinition,
  recalculateAchievements,
} from '../core/achievement';
import { normalizeDishName } from '../core/mealHistory';

interface AchievementInput {
  achievementId?: unknown;
  id?: unknown;
  ids?: unknown;
  achievementIds?: unknown;
}

function textId(value: unknown, field = '成就ID'): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', `${field}无效`);
  return value.trim();
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function getAchievementSnapshot(env: Env, userId: string): Promise<Awaited<ReturnType<typeof recalculateAchievements>>> {
  return recalculateAchievements(env, userId);
}

async function summary(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const snapshot = await recalculateAchievements(env, auth.user.id);
  return json({
    unlockedCount: snapshot.unlockedCount,
    total: snapshot.total,
    pinnedAchievementId: snapshot.pinnedAchievementId,
    achievements: snapshot.list,
    list: snapshot.list,
    newlyUnlocked: snapshot.newlyUnlocked,
    metrics: snapshot.metrics,
  });
}

async function list(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const snapshot = await recalculateAchievements(env, auth.user.id);
  return json({
    list: snapshot.list,
    unlockedCount: snapshot.unlockedCount,
    total: snapshot.total,
    pinnedAchievementId: snapshot.pinnedAchievementId,
    newlyUnlocked: snapshot.newlyUnlocked,
  });
}

async function atlas(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const familyId = url.searchParams.get('familyId')?.trim() || '';
  if (familyId) {
    const membership = await env.DB.prepare(`
      SELECT 1 FROM family_members fm JOIN families f ON f.id = fm.familyId
      WHERE fm.familyId = ? AND fm.userId = ? AND fm.status = 'active' AND f.status = 'active'
    `).bind(familyId, auth.user.id).first();
    if (!membership) throw new ApiError(403, 'FAMILY_ACCESS_DENIED', '无权访问该家庭');
  }
  const conditions = [
    'p.userId = ?',
    'p.personalHiddenAt IS NULL',
    'mr.deletedAt IS NULL',
    "trim(d.normalizedName) <> ''",
  ];
  const bindings: unknown[] = [auth.user.id];
  if (familyId) { conditions.push('mr.familyId = ?'); bindings.push(familyId); }
  const rows = await env.DB.prepare(`
    SELECT mr.id AS recordId, mr.date, mr.scopeKey, mr.familyId, mr.familyNameSnapshot,
      d.normalizedName, d.nameSnapshot, d.typeSnapshot, d.imagesSnapshot
    FROM meal_records mr
    JOIN meal_record_participants p ON p.mealRecordId = mr.id
    JOIN meal_record_dishes d ON d.mealRecordId = mr.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY mr.date ASC, mr.id ASC, d.sortOrder ASC
  `).bind(...bindings).all<Record<string, unknown>>();
  type AtlasAccumulator = {
    key: string;
    name: string;
    normalizedName: string;
    type: string;
    image: string;
    count: number;
    firstDate: string;
    latestDate: string;
    familyId: string | null;
    familyName: string;
    recordIds: string[];
  };
  const grouped = new Map<string, AtlasAccumulator>();
  const seenDishOccurrences = new Set<string>();
  for (const row of rows.results) {
    const normalizedName = textValue(row.normalizedName) || normalizeDishName(textValue(row.nameSnapshot));
    const scopeKey = textValue(row.scopeKey);
    const recordId = textValue(row.recordId);
    const occurrenceKey = `${recordId}\u0000${scopeKey}\u0000${normalizedName}`;
    if (seenDishOccurrences.has(occurrenceKey)) continue;
    seenDishOccurrences.add(occurrenceKey);
    const key = `${scopeKey}\u0000${normalizedName}`;
    const date = textValue(row.date);
    const current = grouped.get(key);
    if (!current) {
      const images = normalizeImageList(row.imagesSnapshot, env);
      grouped.set(key, {
        key,
        name: textValue(row.nameSnapshot),
        normalizedName,
        type: textValue(row.typeSnapshot),
        image: images[0] || '',
        count: 1,
        firstDate: date,
        latestDate: date,
        familyId: textValue(row.familyId) || null,
        familyName: textValue(row.familyNameSnapshot),
        recordIds: [recordId],
      });
      continue;
    }
    current.count += 1;
    if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
    if (date > current.latestDate) current.latestDate = date;
    if (!current.image) current.image = normalizeImageList(row.imagesSnapshot, env)[0] || '';
    if (!current.recordIds.includes(recordId)) current.recordIds.push(recordId);
  }
  const list = Array.from(grouped.values())
    .sort((left, right) => right.latestDate.localeCompare(left.latestDate, 'zh-CN') || left.name.localeCompare(right.name, 'zh-CN'))
    .map(item => ({ ...item, recordIds: item.recordIds.slice(0, 100) }));
  return json({ list, total: list.length, familyId: familyId || null });
}

async function pin(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<AchievementInput>(request);
  const raw = body.achievementId ?? body.id;
  const achievementId = raw === undefined || raw === null || raw === '' ? null : textId(raw);
  const snapshot = await recalculateAchievements(env, auth.user.id);
  if (achievementId) {
    const definition = achievementDefinition(achievementId);
    if (!definition) throw new ApiError(400, 'ACHIEVEMENT_NOT_FOUND', '成就不存在');
    const progress = snapshot.list.find(item => item.id === achievementId);
    if (!progress?.unlocked) throw new ApiError(409, 'ACHIEVEMENT_LOCKED', '只能佩戴已解锁的成就');
  }
  const at = Date.now();
  await env.DB.prepare(`
    INSERT INTO user_achievement_state (userId, pinnedAchievementId, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET pinnedAchievementId = excluded.pinnedAchievementId, updatedAt = excluded.updatedAt
  `).bind(auth.user.id, achievementId, at).run();
  return json({ pinnedAchievementId: achievementId });
}

async function acknowledge(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson<AchievementInput>(request);
  const raw = body.achievementIds ?? body.ids;
  let ids: string[] | null = null;
  if (raw !== undefined && raw !== null) {
    if (!Array.isArray(raw)) throw new ApiError(400, 'VALIDATION_ERROR', '成就ID必须是数组');
    ids = Array.from(new Set(raw.map(item => textId(item))));
    if (ids.some(id => !achievementDefinition(id))) throw new ApiError(400, 'ACHIEVEMENT_NOT_FOUND', '成就不存在');
  }
  const snapshot = await recalculateAchievements(env, auth.user.id);
  const unlocked = new Set(snapshot.list.filter(item => item.unlocked).map(item => item.id));
  const targets = (ids || Array.from(unlocked)).filter(id => unlocked.has(id));
  if (targets.length) {
    const placeholders = targets.map(() => '?').join(',');
    await env.DB.prepare(`
      UPDATE user_achievements SET acknowledgedAt = ?
      WHERE userId = ? AND achievementId IN (${placeholders}) AND acknowledgedAt IS NULL
    `).bind(Date.now(), auth.user.id, ...targets).run();
  }
  return json({ success: true, acknowledgedCount: targets.length });
}

export async function handleAchievementV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/achievement/summary': return summary(request, env);
    case 'GET /api/achievement/list': return list(request, env);
    case 'GET /api/achievement/atlas': return atlas(request, env);
    case 'PUT /api/achievement/pin': return pin(request, env);
    case 'POST /api/achievement/unlocks/ack': return acknowledge(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
