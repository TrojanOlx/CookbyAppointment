/**
 * 餐桌回忆相关数据模型。
 *
 * 服务端在迁移期间可能同时返回 camelCase 与 snake_case 字段，页面只依赖
 * 这些公开字段，未识别的字段会通过索引签名保留，方便旧记录渐进回填。
 */

export type HistoryScope = 'personal' | 'family';
export type HistorySource = 'automatic' | 'manual' | 'legacy_backfill' | string;

export interface MealDishSnapshot {
  id?: string;
  dishId?: string;
  originalDishId?: string | null;
  name: string;
  normalizedName?: string;
  type?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  sortOrder?: number;
  repeatable?: boolean;
  available?: boolean;
  [key: string]: unknown;
}

export interface MemoryContribution {
  id?: string;
  participantId?: string;
  userId?: string;
  nickname?: string;
  nickName?: string;
  avatarUrl?: string;
  note?: string;
  content?: string;
  images?: string[];
  photos?: string[];
  imageRefs?: string[];
  excluded?: boolean;
  hidden?: boolean;
  frozen?: boolean;
  frozenAt?: number | string | null;
  canEdit?: boolean;
  updatedAt?: number | string;
  [key: string]: unknown;
}

export interface MealParticipant {
  id?: string;
  participantId?: string;
  userId: string;
  nickname?: string;
  nickName?: string;
  avatarUrl?: string;
  badgeIconUrl?: string;
  badgeName?: string;
  badge?: {
    id?: string;
    name?: string;
    iconUrl?: string;
    icon?: string;
    [key: string]: unknown;
  } | null;
  contribution?: MemoryContribution | null;
  note?: string;
  content?: string;
  images?: string[];
  photos?: string[];
  excluded?: boolean;
  hidden?: boolean;
  frozen?: boolean;
  frozenAt?: number | string | null;
  canEdit?: boolean;
  [key: string]: unknown;
}

export interface MealRecord {
  id: string;
  source: HistorySource;
  sourceLabel?: string;
  scope?: HistoryScope;
  appointmentId?: string | null;
  familyId?: string | null;
  familyName?: string;
  familyScope?: string;
  date: string;
  mealType: string;
  completedAt?: number | string | null;
  createdAt?: number | string | null;
  creatorId?: string | null;
  creatorName?: string;
  dishes: MealDishSnapshot[];
  participants?: MealParticipant[];
  contributions?: MemoryContribution[];
  summary?: string;
  note?: string;
  images?: string[];
  photos?: string[];
  firstImage?: string;
  imageUrl?: string;
  excluded?: boolean;
  deleted?: boolean;
  deletedAt?: number | string | null;
  frozen?: boolean;
  frozenAt?: number | string | null;
  canEdit?: boolean;
  canDelete?: boolean;
  canExclude?: boolean;
  canRepeat?: boolean;
  repeatDishIds?: string[];
  repeatUnavailableNames?: string[];
  repeatFamilyId?: string | null;
  participantCount?: number;
  photoCount?: number;
  noteCount?: number;
  [key: string]: unknown;
}

export interface HistoryListFilters {
  families?: Array<{ id: string; name: string }>;
  years?: number[];
  mealTypes?: string[];
  sources?: Array<{ value: string; label: string }>;
  [key: string]: unknown;
}

export interface HistoryListParams {
  scope?: HistoryScope;
  page?: number;
  pageSize?: number;
  search?: string;
  familyId?: string;
  year?: number | string;
  mealType?: string;
  source?: HistorySource;
  [key: string]: unknown;
}

export interface HistoryListResponse {
  total: number;
  list: MealRecord[];
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  filters?: HistoryListFilters;
  [key: string]: unknown;
}

export interface HistoryDetailResponse {
  record: MealRecord;
  [key: string]: unknown;
}

export interface HistoryDishInput {
  name: string;
  dishId?: string;
  type?: string;
  images?: string[];
}

export interface HistoryCreateInput {
  id?: string;
  date: string;
  mealType: string;
  scope: HistoryScope;
  familyId?: string;
  dishIds?: string[];
  dishNames?: string[];
  customDishNames?: string[];
  dishes?: HistoryDishInput[] | string[];
  images?: string[];
  imageRefs?: string[];
  note?: string;
  content?: string;
  confirmDuplicate?: boolean;
  [key: string]: unknown;
}

export interface HistoryUpdateInput extends Partial<HistoryCreateInput> {
  id: string;
}

export interface HistoryContributionInput {
  recordId: string;
  participantId?: string;
  note?: string;
  content?: string;
  images?: string[];
  imageRefs?: string[];
  [key: string]: unknown;
}

export interface HistoryMutationResponse {
  success?: boolean;
  record?: MealRecord;
  [key: string]: unknown;
}

export interface HistoryFile {
  id?: string;
  fileId?: string;
  key?: string;
  url?: string;
  downloadUrl?: string;
  filePath?: string;
  [key: string]: unknown;
}

export interface HistoryFileUploadResponse {
  success?: boolean;
  file?: HistoryFile;
  data?: HistoryFile;
  id?: string;
  fileId?: string;
  url?: string;
  [key: string]: unknown;
}

export interface HistoryFileDownloadResponse {
  url?: string;
  downloadUrl?: string;
  expiresAt?: number | string;
  [key: string]: unknown;
}
