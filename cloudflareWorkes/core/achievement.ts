import type { Env } from './types';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  target: number;
  category: '餐次' | '菜品' | '特殊' | '时光' | '回忆';
  icon: string;
}

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  unlocked: boolean;
  unlockedAt: number | null;
  acknowledgedAt: number | null;
}

export interface AchievementMetrics {
  mealCount: number;
  uniqueDishCount: number;
  repeatedDishMax: number;
  mealTypes: number;
  monthCount: number;
  photoCount: number;
  noteCount: number;
}

export interface AchievementSnapshot {
  list: AchievementProgress[];
  unlockedCount: number;
  total: number;
  pinnedAchievementId: string | null;
  newlyUnlocked: AchievementProgress[];
  metrics: AchievementMetrics;
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  { id: 'meal-first', name: '第一餐', description: '完成第一餐', target: 1, category: '餐次', icon: 'utensils' },
  { id: 'meal-ten', name: '十餐烟火', description: '累计完成十餐', target: 10, category: '餐次', icon: 'flame' },
  { id: 'meal-thirty', name: '常伴三十餐', description: '累计完成三十餐', target: 30, category: '餐次', icon: 'calendar-heart' },
  { id: 'meal-hundred', name: '百餐纪念', description: '累计完成一百餐', target: 100, category: '餐次', icon: 'trophy' },
  { id: 'dish-five', name: '五味初尝', description: '尝过五道不同菜品', target: 5, category: '菜品', icon: 'soup' },
  { id: 'dish-fifteen', name: '菜单探险家', description: '尝过十五道不同菜品', target: 15, category: '菜品', icon: 'map' },
  { id: 'dish-thirty', name: '百味收藏家', description: '尝过三十道不同菜品', target: 30, category: '菜品', icon: 'library-big' },
  { id: 'dish-return-five', name: '最爱返场', description: '同一道菜累计吃过五次', target: 5, category: '特殊', icon: 'repeat-2' },
  { id: 'meal-types-three', name: '三餐集齐', description: '早餐、午餐、晚餐各完成过一次', target: 3, category: '时光', icon: 'sun' },
  { id: 'months-three', name: '月月有味', description: '历史覆盖三个自然月', target: 3, category: '时光', icon: 'calendar-days' },
  { id: 'photo-first', name: '有图有味', description: '首次为餐桌回忆添加照片', target: 1, category: '回忆', icon: 'camera' },
  { id: 'note-five', name: '滋味成册', description: '累计写下五条感想', target: 5, category: '回忆', icon: 'notebook-pen' },
];

interface EffectiveRecord {
  id: string;
  date: string;
  mealType: string;
  scopeKey: string;
}

interface EffectiveDish {
  recordId: string;
  scopeKey: string;
  normalizedName: string;
}

function normalizedMealType(value: string): 'breakfast' | 'lunch' | 'dinner' | null {
  const normalized = value.trim().toLowerCase();
  if (['早餐', '早饭', '早餐', 'breakfast', 'morning'].includes(normalized)) return 'breakfast';
  if (['午餐', '午饭', '中餐', 'lunch', 'noon'].includes(normalized)) return 'lunch';
  if (['晚餐', '晚饭', '晚膳', 'dinner', 'supper', 'evening'].includes(normalized)) return 'dinner';
  return null;
}

export async function calculateAchievementMetrics(env: Env, userId: string): Promise<AchievementMetrics> {
  const [records, dishes, notes, photos] = await env.DB.batch([
    env.DB.prepare(`
      SELECT mr.id, mr.date, mr.mealType, mr.scopeKey
      FROM meal_records mr
      JOIN meal_record_participants p ON p.mealRecordId = mr.id
      WHERE p.userId = ? AND p.personalHiddenAt IS NULL AND mr.deletedAt IS NULL
    `).bind(userId),
    env.DB.prepare(`
      SELECT mr.id AS recordId, mr.scopeKey, d.normalizedName
      FROM meal_records mr
      JOIN meal_record_participants p ON p.mealRecordId = mr.id
      JOIN meal_record_dishes d ON d.mealRecordId = mr.id
      WHERE p.userId = ? AND p.personalHiddenAt IS NULL AND mr.deletedAt IS NULL
        AND trim(d.normalizedName) <> ''
    `).bind(userId),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM meal_records mr
      JOIN meal_record_participants p ON p.mealRecordId = mr.id
      WHERE p.userId = ? AND p.personalHiddenAt IS NULL AND mr.deletedAt IS NULL
        AND length(trim(p.note)) > 0
    `).bind(userId),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM meal_memory_files f
      JOIN meal_records mr ON mr.id = f.mealRecordId
      JOIN meal_record_participants p
        ON p.mealRecordId = mr.id AND p.userId = f.participantUserId
      WHERE p.userId = ? AND p.personalHiddenAt IS NULL AND mr.deletedAt IS NULL
        AND f.deletedAt IS NULL AND f.attachedAt IS NOT NULL
    `).bind(userId),
  ]);

  const recordRows = records.results as unknown as EffectiveRecord[];
  const dishRows = dishes.results as unknown as EffectiveDish[];
  const uniqueDishes = new Set<string>();
  const dishCounts = new Map<string, number>();
  const seenDishOccurrences = new Set<string>();
  for (const dish of dishRows) {
    const name = String(dish.normalizedName || '').trim();
    if (!name) continue;
    const key = `${dish.scopeKey}\u0000${name}`;
    const occurrenceKey = `${String(dish.recordId || '')}\u0000${key}`;
    if (seenDishOccurrences.has(occurrenceKey)) continue;
    seenDishOccurrences.add(occurrenceKey);
    uniqueDishes.add(key);
    dishCounts.set(key, (dishCounts.get(key) || 0) + 1);
  }
  const mealTypes = new Set(recordRows.map(record => normalizedMealType(String(record.mealType || ''))).filter(Boolean));
  const months = new Set(recordRows
    .map(record => String(record.date || '').slice(0, 7))
    .filter(value => /^\d{4}-\d{2}$/.test(value)));
  return {
    mealCount: new Set(recordRows.map(record => record.id)).size,
    uniqueDishCount: uniqueDishes.size,
    repeatedDishMax: Math.max(0, ...dishCounts.values()),
    mealTypes: mealTypes.size,
    monthCount: months.size,
    photoCount: Number((photos.results[0] as { count?: unknown } | undefined)?.count || 0),
    noteCount: Number((notes.results[0] as { count?: unknown } | undefined)?.count || 0),
  };
}

function currentFor(definition: AchievementDefinition, metrics: AchievementMetrics): number {
  switch (definition.id) {
    case 'meal-first':
    case 'meal-ten':
    case 'meal-thirty':
    case 'meal-hundred': return metrics.mealCount;
    case 'dish-five':
    case 'dish-fifteen':
    case 'dish-thirty': return metrics.uniqueDishCount;
    case 'dish-return-five': return metrics.repeatedDishMax;
    case 'meal-types-three': return metrics.mealTypes;
    case 'months-three': return metrics.monthCount;
    case 'photo-first': return metrics.photoCount > 0 ? 1 : 0;
    case 'note-five': return metrics.noteCount;
    default: return 0;
  }
}

export function progressForDefinitions(
  metrics: AchievementMetrics,
  unlocked: Map<string, { unlockedAt: number; acknowledgedAt: number | null }>,
): AchievementProgress[] {
  return ACHIEVEMENT_DEFINITIONS.map(definition => {
    const current = currentFor(definition, metrics);
    const unlock = unlocked.get(definition.id);
    return {
      ...definition,
      current,
      unlocked: current >= definition.target,
      unlockedAt: unlock?.unlockedAt || null,
      acknowledgedAt: unlock?.acknowledgedAt || null,
    };
  });
}

export async function recalculateAchievements(env: Env, userId: string, at = Date.now()): Promise<AchievementSnapshot> {
  const timestamp = Number.isFinite(at) && at > 0 ? at : Date.now();
  const metrics = await calculateAchievementMetrics(env, userId);
  const existingRows = await env.DB.prepare(`
    SELECT achievementId, unlockedAt, acknowledgedAt
    FROM user_achievements WHERE userId = ?
  `).bind(userId).all<{ achievementId: string; unlockedAt: number; acknowledgedAt: number | null }>();
  const existing = new Map(existingRows.results.map(row => [row.achievementId, row]));
  const currentUnlocked = new Set(ACHIEVEMENT_DEFINITIONS
    .filter(definition => currentFor(definition, metrics) >= definition.target)
    .map(definition => definition.id));
  const newlyUnlocked = ACHIEVEMENT_DEFINITIONS.filter(definition => currentUnlocked.has(definition.id) && !existing.has(definition.id));
  const lost = Array.from(existing.keys()).filter(id => !currentUnlocked.has(id));
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT OR IGNORE INTO user_achievement_state (userId, pinnedAchievementId, updatedAt)
      VALUES (?, NULL, ?)
    `).bind(userId, timestamp),
  ];
  for (const definition of newlyUnlocked) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO user_achievements (userId, achievementId, unlockedAt, acknowledgedAt)
      VALUES (?, ?, ?, NULL)
    `).bind(userId, definition.id, timestamp));
  }
  for (const achievementId of lost) {
    statements.push(env.DB.prepare('DELETE FROM user_achievements WHERE userId = ? AND achievementId = ?').bind(userId, achievementId));
  }
  statements.push(env.DB.prepare(`
    UPDATE user_achievement_state
    SET pinnedAchievementId = CASE
      WHEN pinnedAchievementId IN (SELECT achievementId FROM user_achievements WHERE userId = ?)
      THEN pinnedAchievementId ELSE NULL END,
      updatedAt = ?
    WHERE userId = ?
  `).bind(userId, timestamp, userId));
  await env.DB.batch(statements);

  const [unlockedRows, state] = await env.DB.batch([
    env.DB.prepare('SELECT achievementId, unlockedAt, acknowledgedAt FROM user_achievements WHERE userId = ?').bind(userId),
    env.DB.prepare('SELECT pinnedAchievementId FROM user_achievement_state WHERE userId = ?').bind(userId),
  ]);
  const unlocked = new Map((unlockedRows.results as Array<{ achievementId: string; unlockedAt: number; acknowledgedAt: number | null }>)
    .map(row => [row.achievementId, { unlockedAt: row.unlockedAt, acknowledgedAt: row.acknowledgedAt }]));
  const list = progressForDefinitions(metrics, unlocked);
  const newProgress = list.filter(item => newlyUnlocked.some(definition => definition.id === item.id));
  return {
    list,
    unlockedCount: list.filter(item => item.unlocked).length,
    total: ACHIEVEMENT_DEFINITIONS.length,
    pinnedAchievementId: (state.results[0] as { pinnedAchievementId?: string | null } | undefined)?.pinnedAchievementId || null,
    newlyUnlocked: newProgress,
    metrics,
  };
}

export function achievementDefinition(id: string): AchievementDefinition | null {
  return ACHIEVEMENT_DEFINITIONS.find(definition => definition.id === id) || null;
}
