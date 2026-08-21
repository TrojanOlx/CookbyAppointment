import { get, post } from './http';

export type PlatformUserStatus = 'active' | 'suspended' | string;

export interface PlatformStatus {
  isPlatformAdmin: boolean;
  role: string;
  userId: string;
}

export interface PlatformOverview {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalFamilies: number;
  activeFamilies: number;
  totalRecipeTemplates: number;
  publishedRecipeTemplates: number;
  totalIngredients: number;
  [key: string]: unknown;
}

export interface PlatformUser {
  id: string;
  nickName: string;
  avatarUrl: string;
  status: PlatformUserStatus;
  createTime: number | string;
  updateTime?: number | string;
  familyCount?: number;
  activeFamilyCount?: number;
  isPlatformAdmin?: boolean;
  isOwner?: boolean;
  suspendReason?: string;
  suspendedAt?: number | string;
  lastSeenAt?: number | string;
}

export interface PlatformFamilySummary {
  id: string;
  name: string;
  status: string;
  owner: {
    id?: string;
    nickName?: string;
    avatarUrl?: string;
  } | null;
  memberCount: number;
  recipeCount: number;
  appointmentCount: number;
  inventoryCount: number;
  shoppingItemCount: number;
  createTime: number | string;
  role?: string;
  membershipStatus?: string;
}

export interface PlatformSessionSummary {
  lastActiveAt?: number | string;
  expiresAt?: number | string;
  deviceCount?: number;
  sessionCount?: number;
}

export interface PlatformUserDetail extends PlatformUser {
  families: PlatformFamilySummary[];
  lastSession: PlatformSessionSummary | null;
}

export interface PlatformAuditEvent {
  id: string;
  action: string;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  familyId?: string | null;
  details?: Record<string, unknown> | string | null;
  createTime: number | string;
}

export interface PageResult<T> {
  total: number;
  page: number;
  pageSize: number;
  list: T[];
  hasMore: boolean;
}

export interface PlatformUserQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

export interface PlatformFamilyQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

export interface PlatformAuditQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

const asRecord = (value: unknown): Record<string, any> => {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
};

const firstValue = <T>(source: Record<string, any>, keys: string[], fallback: T): T => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key] as T;
  }
  return fallback;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePage = <T>(response: unknown, normalize: (value: unknown) => T): PageResult<T> => {
  const source = asRecord(response);
  const nested = asRecord(source.data || source.result);
  const listValue = firstValue<unknown[]>(source, ['list', 'items', 'users', 'families', 'events'],
    firstValue<unknown[]>(nested, ['list', 'items', 'users', 'families', 'events'], []));
  const list = Array.isArray(listValue) ? listValue.map(normalize) : [];
  const page = toNumber(firstValue(source, ['page', 'currentPage'], firstValue(nested, ['page', 'currentPage'], 1)), 1);
  const pageSize = toNumber(firstValue(source, ['pageSize', 'limit'], firstValue(nested, ['pageSize', 'limit'], list.length || 20)), list.length || 20);
  const total = toNumber(firstValue(source, ['total', 'count'], firstValue(nested, ['total', 'count'], list.length)), list.length);
  return { total, page, pageSize, list, hasMore: page * pageSize < total };
};

const normalizeUser = (value: unknown): PlatformUser => {
  const item = asRecord(value);
  return {
    id: String(item.id || item.userId || ''),
    nickName: String(item.nickName || item.nickname || '未设置昵称'),
    avatarUrl: String(item.avatarUrl || ''),
    status: String(item.status || 'active'),
    createTime: firstValue(item, ['createTime', 'createdAt'], ''),
    updateTime: firstValue(item, ['updateTime', 'updatedAt'], undefined),
    familyCount: toNumber(firstValue(item, ['familyCount', 'familiesCount'], 0)),
    activeFamilyCount: toNumber(firstValue(item, ['activeFamilyCount'], 0)),
    isPlatformAdmin: !!item.isPlatformAdmin,
    isOwner: !!item.isOwner,
    suspendReason: item.suspendReason ? String(item.suspendReason) : '',
    suspendedAt: firstValue(item, ['suspendedAt'], undefined),
    lastSeenAt: firstValue(item, ['lastSeenAt'], undefined)
  };
};

const normalizeFamily = (value: unknown): PlatformFamilySummary => {
  const item = asRecord(value);
  const ownerSource = asRecord(item.owner || item.ownerUser);
  const ownerName = item.ownerName || item.ownerNickName;
  const ownerId = item.ownerUserId || item.ownerId;
  return {
    id: String(item.id || item.familyId || ''),
    name: String(item.name || '未命名家庭'),
    status: String(item.status || item.familyStatus || 'active'),
    owner: item.owner || item.ownerUser || ownerName || ownerId ? {
      id: ownerSource.id ? String(ownerSource.id) : ownerId ? String(ownerId) : undefined,
      nickName: ownerSource.nickName ? String(ownerSource.nickName) : ownerName ? String(ownerName) : undefined,
      avatarUrl: ownerSource.avatarUrl ? String(ownerSource.avatarUrl) : undefined
    } : null,
    memberCount: toNumber(firstValue(item, ['memberCount', 'membersCount'], 0)),
    recipeCount: toNumber(firstValue(item, ['recipeCount', 'dishCount'], 0)),
    appointmentCount: toNumber(firstValue(item, ['appointmentCount'], 0)),
    inventoryCount: toNumber(firstValue(item, ['inventoryCount', 'ingredientCount'], 0)),
    shoppingItemCount: toNumber(firstValue(item, ['shoppingItemCount', 'shoppingCount'], 0)),
    createTime: firstValue(item, ['createTime', 'createdAt'], ''),
    role: item.role ? String(item.role) : undefined,
    membershipStatus: item.membershipStatus ? String(item.membershipStatus) : undefined
  };
};

const normalizeAudit = (value: unknown): PlatformAuditEvent => {
  const item = asRecord(value);
  const details = item.details === undefined || item.details === null
    ? null
    : (typeof item.details === 'string' ? item.details : item.details as Record<string, unknown>);
  return {
    id: String(item.id || item.eventId || ''),
    action: String(item.action || item.type || 'platform.unknown'),
    actorId: item.actorId || item.userId || item.actorUserId ? String(item.actorId || item.userId || item.actorUserId) : undefined,
    actorName: item.actorName || item.nickName ? String(item.actorName || item.nickName) : undefined,
    targetId: item.targetId ? String(item.targetId) : undefined,
    familyId: item.familyId === undefined ? null : (item.familyId ? String(item.familyId) : null),
    details,
    createTime: firstValue(item, ['createTime', 'createdAt'], '')
  };
};

const normalizeStatus = (response: unknown): PlatformStatus => {
  const source = asRecord(response);
  const nested = asRecord(source.data || source.result);
  const merged = { ...nested, ...source };
  return {
    isPlatformAdmin: !!firstValue(merged, ['isPlatformAdmin', 'isAdmin'], false),
    role: String(firstValue(merged, ['role', 'platformRole'], '')),
    userId: String(firstValue(merged, ['userId', 'id'], ''))
  };
};

const normalizeOverview = (response: unknown): PlatformOverview => {
  const source = asRecord(response);
  const nested = asRecord(source.data || source.result);
  const merged = { ...nested, ...source };
  const users = asRecord(merged.users);
  const families = asRecord(merged.families);
  const templates = asRecord(merged.templates);
  const ingredients = asRecord(merged.ingredients);
  return {
    totalUsers: toNumber(firstValue(merged, ['totalUsers', 'userCount'], firstValue(users, ['total'], 0))),
    activeUsers: toNumber(firstValue(merged, ['activeUsers'], firstValue(users, ['active'], 0))),
    suspendedUsers: toNumber(firstValue(merged, ['suspendedUsers'], firstValue(users, ['suspended'], 0))),
    totalFamilies: toNumber(firstValue(merged, ['totalFamilies', 'familyCount'], firstValue(families, ['total'], 0))),
    activeFamilies: toNumber(firstValue(merged, ['activeFamilies'], firstValue(families, ['active'], 0))),
    totalRecipeTemplates: toNumber(firstValue(merged, ['totalRecipeTemplates', 'recipeTemplateCount', 'templateCount'], firstValue(templates, ['total'], 0))),
    publishedRecipeTemplates: toNumber(firstValue(merged, ['publishedRecipeTemplates', 'publishedTemplateCount'], firstValue(templates, ['active'], 0))),
    totalIngredients: toNumber(firstValue(merged, ['totalIngredients', 'ingredientCount'], firstValue(ingredients, ['total'], 0)))
  };
};

const pathId = (id: string): string => encodeURIComponent(String(id || ''));

export class PlatformAdminService {
  static async getStatus(): Promise<PlatformStatus> {
    return normalizeStatus(await get('/api/platform/status'));
  }

  static async getOverview(): Promise<PlatformOverview> {
    return normalizeOverview(await get('/api/platform/overview'));
  }

  static async getUsers(query: PlatformUserQuery = {}): Promise<PageResult<PlatformUser>> {
    return normalizePage(await get('/api/platform/users', query), normalizeUser);
  }

  static async getUserDetail(userId: string): Promise<PlatformUserDetail> {
    const source = asRecord(await get(`/api/platform/users/${pathId(userId)}`));
    const nested = asRecord(source.data || source.result);
    const user = normalizeUser({ ...nested, ...source });
    const familyValue = firstValue<unknown[]>(source, ['families'], firstValue<unknown[]>(nested, ['families'], []));
    const families = Array.isArray(familyValue) ? familyValue.map(normalizeFamily) : [];
    const rawSession = firstValue<unknown>(source, ['lastSession'], firstValue<unknown>(nested, ['lastSession'], null));
    const session = rawSession || source.lastSeenAt || source.activeSessionCount !== undefined
      ? {
        ...(asRecord(rawSession)),
        lastActiveAt: asRecord(rawSession).lastActiveAt || source.lastSeenAt,
        sessionCount: asRecord(rawSession).sessionCount || source.activeSessionCount
      }
      : null;
    return {
      ...user,
      isOwner: user.isOwner || families.some(item => {
        const original = asRecord(Array.isArray(familyValue) ? familyValue.find(value => normalizeFamily(value).id === item.id) : null);
        return String(original.role || '') === 'owner' && item.status === 'active';
      }),
      families,
      lastSession: session ? asRecord(session) as PlatformSessionSummary : null
    };
  }

  static async revokeSessions(userId: string): Promise<{ success: boolean }> {
    return post(`/api/platform/users/${pathId(userId)}/revoke-sessions`);
  }

  static async suspendUser(userId: string, reason: string): Promise<{ success: boolean }> {
    return post(`/api/platform/users/${pathId(userId)}/suspend`, { reason: reason.trim() });
  }

  static async restoreUser(userId: string): Promise<{ success: boolean }> {
    return post(`/api/platform/users/${pathId(userId)}/restore`);
  }

  static async getFamilies(query: PlatformFamilyQuery = {}): Promise<PageResult<PlatformFamilySummary>> {
    return normalizePage(await get('/api/platform/families', query), normalizeFamily);
  }

  static async getAudit(query: PlatformAuditQuery = {}): Promise<PageResult<PlatformAuditEvent>> {
    const { actorId, startDate, endDate, ...rest } = query;
    const from = startDate ? new Date(`${startDate}T00:00:00+08:00`).getTime() : undefined;
    const to = endDate ? new Date(`${endDate}T23:59:59.999+08:00`).getTime() : undefined;
    return normalizePage(await get('/api/platform/audit', {
      ...rest,
      actorUserId: actorId,
      from: Number.isFinite(from) ? from : undefined,
      to: Number.isFinite(to) ? to : undefined
    }), normalizeAudit);
  }
}

export default PlatformAdminService;
