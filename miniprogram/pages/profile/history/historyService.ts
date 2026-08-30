import { del, get, post, put, upload } from '../../../services/http';
import {
  HistoryContributionInput,
  HistoryCreateInput,
  HistoryDetailResponse,
  HistoryFileDownloadResponse,
  HistoryFileUploadResponse,
  HistoryListParams,
  HistoryListResponse,
  HistoryMutationResponse,
  HistoryUpdateInput,
  MealRecord,
} from '../../../models/history';

export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_PHOTOS = 3;
export const HISTORY_MAX_NOTE_LENGTH = 500;

export interface HistoryUploadOptions {
  recordId?: string;
  participantId?: string;
  ownerId?: string;
  familyId?: string;
  fileName?: string;
}

const cleanListParams = (params: HistoryListParams): Record<string, unknown> => {
  const result: Record<string, unknown> = {
    scope: params.scope || 'personal',
    page: Number(params.page) > 0 ? Number(params.page) : 1,
    pageSize: Number(params.pageSize) > 0 ? Number(params.pageSize) : HISTORY_PAGE_SIZE,
  };
  Object.entries(params).forEach(([key, value]) => {
    if (['scope', 'page', 'pageSize'].includes(key)) return;
    if (value !== undefined && value !== null && String(value) !== '') result[key] = value;
  });
  return result;
};

/** 将接口包装响应统一为页面使用的 list/total 形状。 */
export const normalizeHistoryListResponse = (response: HistoryListResponse | Record<string, unknown>): HistoryListResponse => {
  const raw = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const nested = raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : raw;
  const listValue = nested.list || nested.items || nested.records;
  const list = Array.isArray(listValue) ? listValue as MealRecord[] : [];
  const total = Number(nested.total ?? raw.total ?? list.length) || 0;
  const page = Number(nested.page ?? raw.page ?? 1) || 1;
  const pageSize = Number(nested.pageSize ?? raw.pageSize ?? HISTORY_PAGE_SIZE) || HISTORY_PAGE_SIZE;
  const hasMore = typeof nested.hasMore === 'boolean'
    ? nested.hasMore
    : list.length < total;
  return {
    ...raw,
    ...nested,
    list,
    total,
    page,
    pageSize,
    hasMore,
    filters: (nested.filters || raw.filters) as HistoryListResponse['filters'],
  };
};

/** 将接口包装的详情响应统一为 record。 */
export const normalizeHistoryDetailResponse = (response: HistoryDetailResponse | MealRecord | Record<string, unknown>): HistoryDetailResponse => {
  const raw = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const nested = raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : raw;
  const record = (nested.record && typeof nested.record === 'object'
    ? nested.record
    : nested.history && typeof nested.history === 'object'
      ? nested.history
      : nested) as MealRecord;
  return { ...raw, ...nested, record };
};

export class HistoryService {
  static async getHistoryList(params: HistoryListParams = {}): Promise<HistoryListResponse> {
    const response = await get<HistoryListResponse>('/api/history/list', cleanListParams(params));
    return normalizeHistoryListResponse(response);
  }

  static async getHistoryDetail(id: string): Promise<MealRecord> {
    const response = await get<HistoryDetailResponse | MealRecord>('/api/history/detail', { id });
    return normalizeHistoryDetailResponse(response).record;
  }

  static async createHistory(payload: HistoryCreateInput): Promise<HistoryMutationResponse> {
    return post<HistoryMutationResponse>('/api/history/create', payload);
  }

  static async updateHistory(payload: HistoryUpdateInput): Promise<HistoryMutationResponse> {
    return put<HistoryMutationResponse>('/api/history/update', payload);
  }

  static async updateContribution(payload: HistoryContributionInput): Promise<HistoryMutationResponse> {
    return put<HistoryMutationResponse>('/api/history/contribution', payload);
  }

  static async excludeHistory(id: string, excluded = true): Promise<HistoryMutationResponse> {
    return put<HistoryMutationResponse>('/api/history/exclude', { id, excluded });
  }

  static async deleteHistory(id: string): Promise<HistoryMutationResponse> {
    return del<HistoryMutationResponse>('/api/history/delete', { id });
  }

  static async uploadMemoryFile(
    filePath: string,
    options: HistoryUploadOptions = {}
  ): Promise<HistoryFileUploadResponse> {
    const formData: Record<string, unknown> = {};
    if (options.recordId) formData.recordId = options.recordId;
    if (options.participantId) formData.participantId = options.participantId;
    if (options.ownerId) formData.ownerId = options.ownerId;
    if (options.familyId) formData.familyId = options.familyId;
    if (options.fileName) formData.fileName = options.fileName;
    return upload<HistoryFileUploadResponse>('/api/history/file/upload', filePath, formData);
  }

  static async getMemoryFileDownload(
    fileId: string,
    access?: { expires?: number | string; signature?: string }
  ): Promise<HistoryFileDownloadResponse> {
    return get<HistoryFileDownloadResponse>('/api/history/file/download', {
      id: fileId,
      expires: access?.expires,
      signature: access?.signature,
    });
  }
}
