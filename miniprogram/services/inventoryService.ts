// 库存服务
import { get, getCached, post, put, del } from './http';
import { InventoryItem } from '../models/inventory';
import { SESSION_CACHE_TTL } from '../utils/sessionCache';

export type InventoryExpiryState = 'normal' | 'expiring' | 'expired';

export interface InventoryListQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  keyword?: string;
  expiryState?: InventoryExpiryState;
  expiringDays?: number;
}

export interface InventoryListResponse {
  total: number;
  list: InventoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  summary: {
    total: number;
    normal: number;
    expiring: number;
    expired: number;
  };
}

// 库存服务类
export class InventoryService {
  // 获取库存列表
  static async getInventoryList(
    page: number = 1, 
    pageSize: number = 10, 
    category?: string
  ): Promise<{ total: number, list: InventoryItem[] }> {
    return get<{ total: number, list: InventoryItem[] }>('/api/inventory/list', {
      page, 
      pageSize, 
      category 
    });
  }

  static async listInventory(query: InventoryListQuery = {}, force = false): Promise<InventoryListResponse> {
    return getCached<InventoryListResponse>('/api/inventory/list', {
      page: query.page || 1,
      pageSize: Math.min(50, query.pageSize || 20),
      category: query.category,
      keyword: query.keyword && query.keyword.trim() ? query.keyword.trim() : undefined,
      expiryState: query.expiryState,
      expiringDays: query.expiringDays ?? 3,
    }, {
      resource: 'inventory',
      ttlMs: SESSION_CACHE_TTL.inventory,
      force,
    });
  }

  // 获取库存详情
  static async getInventoryDetail(id: string): Promise<InventoryItem> {
    return get<InventoryItem>('/api/inventory/detail', { id });
  }

  // 添加库存
  static async addInventory(item: Partial<InventoryItem>): Promise<InventoryItem> {
    return post<InventoryItem>('/api/inventory/add', item);
  }

  // 更新库存
  static async updateInventory(item: Partial<InventoryItem> & { expectedUpdateTime?: number }): Promise<InventoryItem> {
    return put<InventoryItem>('/api/inventory/update', item);
  }

  // 删除库存
  static async deleteInventory(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/api/inventory/delete', { id });
  }

  // 搜索库存
  static async searchInventory(
    keyword: string, 
    page: number = 1, 
    pageSize: number = 10
  ): Promise<{ total: number, list: InventoryItem[] }> {
    return get<{ total: number, list: InventoryItem[] }>('/api/inventory/search', { 
      keyword, 
      page, 
      pageSize 
    });
  }

  // 获取临期食材
  static async getExpiringItems(
    days: number = 3, 
    page: number = 1, 
    pageSize: number = 10
  ): Promise<{ total: number, list: InventoryItem[] }> {
    return get<{ total: number, list: InventoryItem[] }>('/api/inventory/expiring', { 
      days, 
      page, 
      pageSize 
    });
  }
}
