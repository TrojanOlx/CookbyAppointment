import { BASE_URL, get, post, put } from './http';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_ICON_PATHS,
  AchievementAtlasResponse,
  AchievementDefinition,
  AchievementListResponse,
  AchievementPinResponse,
  AchievementProgress,
  AchievementSummary,
  AchievementUnlockAckResponse,
  DishAtlasItem
} from '../models/achievement';

type LooseRecord = Record<string, any>;

const asRecord = (value: unknown): LooseRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const firstValue = (record: LooseRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const textValue = (value: unknown, fallback = ''): string => {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || fallback;
};

const numericValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'unlocked', '已解锁'].includes(value.toLowerCase());
  return fallback;
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const normalizeImageUrl = (value: unknown): string => {
  const source = textValue(value);
  if (!source) return '/images/default-dish.jpg';
  if (/^(https?:|data:|wxfile:)/i.test(source)) return source;
  if (source.startsWith('/images/')) return source;
  if (source.startsWith('/')) return `${BASE_URL}${source}`;
  return `${BASE_URL}/${source}`;
};

const catalogForRow = (row: LooseRecord): AchievementDefinition | undefined => {
  const key = textValue(firstValue(row, ['key', 'code', 'slug', 'achievementKey']));
  const id = textValue(firstValue(row, ['id', 'achievementId']));
  const name = textValue(firstValue(row, ['name', 'title', 'displayName']));
  return ACHIEVEMENT_CATALOG.find(item => (
    (key && (item.key === key || item.id === key))
    || (id && (item.key === id || item.id === id))
    || (name && item.name === name)
  ));
};

const listFromResponse = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key];
  }
  const nested = asRecord(root.data);
  for (const key of keys) {
    if (Array.isArray(nested[key])) return nested[key];
  }
  if (Object.keys(nested).length > 0 && Array.isArray(nested.list)) return nested.list;
  return [];
};

const normalizeAchievement = (value: unknown, fallback?: AchievementDefinition): AchievementProgress => {
  const row = asRecord(value);
  const catalog = catalogForRow(row) || fallback || ACHIEVEMENT_CATALOG[0];
  const id = textValue(firstValue(row, ['id', 'achievementId']), catalog.id);
  const key = textValue(firstValue(row, ['key', 'code', 'slug', 'achievementKey']), catalog.key);
  const target = Math.max(1, numericValue(firstValue(row, ['target', 'targetValue', 'goal']), catalog.target));
  const rawCurrent = firstValue(row, ['current', 'currentValue', 'progress', 'value', 'count']);
  const progressObject = asRecord(rawCurrent);
  const current = Math.max(0, numericValue(
    Object.keys(progressObject).length > 0
      ? firstValue(progressObject, ['current', 'value', 'count'])
      : rawCurrent,
    0
  ));
  const unlocked = boolValue(
    firstValue(row, ['unlocked', 'isUnlocked', 'achieved']),
    current >= target
  );
  const pinned = boolValue(firstValue(row, ['pinned', 'isPinned', 'wearing']), false);
  const progressPercent = clampPercent(firstValue(row, ['progressPercent', 'percent']) !== undefined
    ? numericValue(firstValue(row, ['progressPercent', 'percent']))
    : (current / target) * 100);
  const progressLabel = textValue(
    firstValue(row, ['progressLabel', 'progressText', 'displayProgress']),
    `${Math.min(current, target)}/${target} ${catalog.unit}`
  );

  return {
    ...catalog,
    ...row,
    id,
    key,
    name: textValue(firstValue(row, ['name', 'title', 'displayName']), catalog.name),
    description: textValue(firstValue(row, ['description', 'detail', 'copy']), catalog.description),
    category: textValue(firstValue(row, ['category', 'group']), catalog.category),
    icon: ACHIEVEMENT_ICON_PATHS[key] || catalog.icon,
    target,
    unit: textValue(firstValue(row, ['unit', 'targetUnit']), catalog.unit),
    tone: textValue(firstValue(row, ['tone', 'color']), catalog.tone),
    sortOrder: numericValue(firstValue(row, ['sortOrder', 'order']), catalog.sortOrder),
    current,
    unlocked,
    pinned,
    unlockedAt: firstValue(row, ['unlockedAt', 'achievedAt']) as string | null | undefined,
    notified: boolValue(
      firstValue(row, ['notified', 'acknowledged', 'isAcknowledged']),
      firstValue(row, ['acknowledgedAt']) !== undefined && firstValue(row, ['acknowledgedAt']) !== null
    ),
    progressLabel,
    progressPercent
  };
};

const normalizeAchievementList = (payload: unknown): AchievementProgress[] => {
  const rows = listFromResponse(payload, ['achievements', 'list', 'items', 'results']);
  const byKey = new Map<string, AchievementProgress>();
  rows.forEach(row => {
    const normalized = normalizeAchievement(row);
    byKey.set(normalized.key || normalized.id, normalized);
  });

  // Keep the catalog stable while allowing server additions to appear after
  // the twelve product achievements.
  const catalogRows = ACHIEVEMENT_CATALOG.map(definition => {
    const existing = byKey.get(definition.key) || byKey.get(definition.id);
    return existing || normalizeAchievement({}, definition);
  });
  const known = new Set(catalogRows.map(item => item.key || item.id));
  const extraRows = [...byKey.values()].filter(item => !known.has(item.key || item.id));
  return [...catalogRows, ...extraRows].sort((left, right) => left.sortOrder - right.sortOrder);
};

const normalizeIdList = (value: unknown): string[] => asArray(value)
  .map(item => {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    const row = asRecord(item);
    return textValue(firstValue(row, ['id', 'achievementId', 'key', 'code']));
  })
  .filter(Boolean);

const normalizePinnedId = (payload: LooseRecord): string | null => {
  const direct = firstValue(payload, ['pinnedAchievementId', 'pinnedId', 'wearingAchievementId']);
  if (direct !== undefined && direct !== null && String(direct)) return String(direct);
  const pinned = asRecord(firstValue(payload, ['pinnedAchievement', 'pinned']));
  const id = firstValue(pinned, ['id', 'achievementId', 'key', 'code']);
  return id === undefined || id === null || !String(id) ? null : String(id);
};

const normalizeSummary = (payload: unknown): AchievementSummary => {
  const root = asRecord(payload);
  const achievements = normalizeAchievementList(payload);
  const pinnedAchievementId = normalizePinnedId(root);
  const pinnedFromRows = achievements.find(item => item.pinned);
  const pinnedAchievement = pinnedAchievementId
    ? achievements.find(item => String(item.id) === pinnedAchievementId || item.key === pinnedAchievementId) || null
    : pinnedFromRows || null;
  const rawUnacknowledged = firstValue(root, ['unacknowledged', 'unacknowledgedAchievements', 'newlyUnlocked', 'newUnlocks']);
  const unacknowledgedIds = normalizeIdList(rawUnacknowledged);
  const unacknowledged = unacknowledgedIds.length > 0
    ? achievements.filter(item => unacknowledgedIds.includes(item.id) || unacknowledgedIds.includes(item.key))
    : achievements.filter(item => item.unlocked && item.notified === false);
  const explicitUnlocked = firstValue(root, ['unlockedCount', 'unlocked', 'achievedCount']);
  const explicitTotal = firstValue(root, ['totalCount', 'total', 'count']);
  const unlocked = Math.max(0, numericValue(explicitUnlocked, achievements.filter(item => item.unlocked).length));
  const total = Math.max(achievements.length, numericValue(explicitTotal, achievements.length));
  const newlyUnlockedIds = normalizeIdList(
    firstValue(root, ['newlyUnlockedIds', 'unacknowledgedIds'])
  ).concat(unacknowledged.map(item => item.id));

  return {
    total,
    unlocked,
    pinnedAchievementId: pinnedAchievement ? pinnedAchievement.id : pinnedAchievementId,
    newlyUnlockedIds: Array.from(new Set(newlyUnlockedIds)),
    achievements,
    totalCount: total,
    unlockedCount: unlocked,
    pinnedAchievement,
    unacknowledged
  };
};

const normalizeAtlasItem = (value: unknown, index: number): DishAtlasItem => {
  const row = asRecord(value);
  const scopeId = textValue(firstValue(row, ['scopeId', 'scopeKey', 'familyId', 'rangeId']), 'personal');
  const scopeLabel = textValue(firstValue(row, ['scopeLabel', 'familyName', 'familyNameSnapshot', 'rangeName']), scopeId === 'personal' ? '个人记录' : '家庭记录');
  const normalizedName = textValue(firstValue(row, ['normalizedName', 'canonicalName', 'dishKey', 'name']), '未命名菜品');
  const name = textValue(firstValue(row, ['name', 'dishName', 'displayName']), normalizedName);
  const imageUrl = normalizeImageUrl(firstValue(row, ['imageUrl', 'image', 'thumbnail', 'dishImage']));
  const recordIds = asArray(firstValue(row, ['recordIds', 'historyIds', 'mealRecordIds']))
    .map(item => String(item || '')).filter(Boolean);
  const id = textValue(firstValue(row, ['id', 'atlasId', 'dishKey']), `${scopeId}:${normalizedName}:${index}`);
  return {
    ...row,
    id,
    scopeId,
    scopeLabel,
    normalizedName,
    name,
    count: Math.max(0, numericValue(firstValue(row, ['count', 'times', 'repeatCount']), 0)),
    firstDate: textValue(firstValue(row, ['firstDate', 'firstAt', 'earliestDate'])),
    latestDate: textValue(firstValue(row, ['latestDate', 'lastDate', 'recentDate'])),
    imageUrl,
    dishId: textValue(firstValue(row, ['dishId', 'originalDishId']), '') || undefined,
    recordIds
  };
};

const normalizeAtlas = (payload: unknown): AchievementAtlasResponse => {
  const rows = listFromResponse(payload, ['atlas', 'list', 'items', 'results']);
  const list = rows.map(normalizeAtlasItem);
  const root = asRecord(payload);
  const total = Math.max(list.length, numericValue(firstValue(root, ['total', 'totalCount']), list.length));
  return { total, list };
};

export class AchievementService {
  static async getSummary(): Promise<AchievementSummary> {
    const payload = await get<unknown>('/api/achievement/summary', undefined, { force: true, cache: false });
    return normalizeSummary(payload);
  }

  static async getList(): Promise<AchievementListResponse> {
    const payload = await get<unknown>('/api/achievement/list', undefined, { force: true, cache: false });
    const list = normalizeAchievementList(payload);
    const root = asRecord(payload);
    return {
      total: Math.max(list.length, numericValue(firstValue(root, ['total', 'totalCount']), list.length)),
      list
    };
  }

  static async getAtlas(): Promise<AchievementAtlasResponse> {
    const payload = await get<unknown>('/api/achievement/atlas', undefined, { force: true, cache: false });
    return normalizeAtlas(payload);
  }

  static async pin(achievementId: string | null): Promise<AchievementPinResponse> {
    return put<AchievementPinResponse>('/api/achievement/pin', {
      achievementId: achievementId || null
    });
  }

  static async ackUnlocks(ids: string[]): Promise<AchievementUnlockAckResponse> {
    const uniqueIds = Array.from(new Set(ids.map(String).filter(Boolean)));
    if (!uniqueIds.length) return { success: true, acknowledged: [] };
    return post<AchievementUnlockAckResponse>('/api/achievement/unlocks/ack', { ids: uniqueIds });
  }
}
