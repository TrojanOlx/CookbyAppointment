// 库存相关数据模型

// 库存类别
export enum InventoryCategory {
  Meat = '肉类',
  Vegetable = '蔬菜',
  Fruit = '水果',
  Seafood = '海鲜',
  Dairy = '乳制品',
  Grain = '谷物',
  Condiment = '调味品',
  Snack = '零食',
  Other = '其他'
}

// 库存状态
export enum InventoryStatus {
  Fresh = '新鲜',
  Normal = '正常',
  Expiring = '临期',
  Expired = '过期'
}

// 冰箱食材
export interface InventoryItem {
  id: string;           // 唯一ID，数据库主键
  name: string;         // 食材名称
  amount: string;       // 重量/数量
  putInDate: string;    // 放入日期，格式：YYYY-MM-DD
  expiryDate: string;   // 保质期，格式：YYYY-MM-DD
  createTime: number;   // 创建时间
  image?: string;       // 食材图片（可选）
  userId?: string;      // 用户ID（可选）
  openid?: string;      // 用户openid（可选）
  category?: InventoryCategory; // 类别（可选）
  status?: InventoryStatus; // 状态（可选）
  remarks?: string;     // 备注（可选）
  updateTime?: number;  // 更新时间（可选）
} 