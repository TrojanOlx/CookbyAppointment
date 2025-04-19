// 库存服务
import { get, post, put, del } from './http';
import { InventoryItem } from '../models/inventory';

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

  // 获取库存详情
  static async getInventoryDetail(id: string): Promise<InventoryItem> {
    return get<InventoryItem>('/api/inventory/detail', { id });
  }

  // 添加库存
  static async addInventory(item: Partial<InventoryItem>): Promise<InventoryItem> {
    return post<InventoryItem>('/api/inventory/add', item);
  }

  // 更新库存
  static async updateInventory(item: Partial<InventoryItem>): Promise<InventoryItem> {
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