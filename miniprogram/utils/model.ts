// 菜品类型
export enum DishType {
  Stir = '炒菜',
  Vegetable = '青菜',
  Soup = '炖汤',
  Stew = '红烧',
  Steam = '蒸菜'
}

// 菜品辣度
export enum SpicyLevel {
  Mild = '微辣',
  Medium = '中辣',
  Hot = '特辣',
  None = '不辣'
}

// 餐次类型
export enum MealType {
  Breakfast = '早餐',
  Lunch = '午餐',
  Dinner = '晚餐'
}

// 预约状态
export enum AppointmentStatus {
  Pending = '待确认',
  Confirmed = '已确认',
  Cancelled = '已取消',
  Completed = '已完成',
  Rejected = '已拒绝'
}

// 库存类别
export enum InventoryCategory {
  Vegetable = '蔬菜',
  Meat = '肉类',
  Seafood = '海鲜',
  Dairy = '乳制品',
  Condiment = '调味品',
  Grain = '谷物',
  Fruit = '水果',
  Snack = '零食',
  Drink = '饮料',
  Other = '其他'
}

// 库存状态
export enum InventoryStatus {
  Normal = '正常',
  NearExpiry = '即将过期',
  Expired = '已过期',
  Depleted = '已耗尽',
  Discarded = '已丢弃'
}

// 食材
export interface Ingredient {
  id: string;
  name: string; // 名称
  amount: string; // 数量/重量
}

// 菜品
export interface Dish {
  id: string; // 唯一ID
  name: string; // 菜品名称
  type: DishType; // 菜品类型
  spicy: SpicyLevel; // 辣度
  images: string[]; // 图片数组
  ingredients: Ingredient[]; // 所需原料
  steps: string[]; // 制作步骤
  notice: string; // 注意事项
  remark: string; // 备注
  reference: string; // 参考链接
  creatorId?: string; // 创建者ID
  creatorOpenid?: string; // 创建者openid
  createTime: number; // 创建时间
  updateTime?: number; // 更新时间
}

// 预约记录
export interface Appointment {
  id: string; // 唯一ID
  date: string; // 日期，格式：YYYY-MM-DD
  mealType: MealType; // 餐次
  dishes: string[]; // 菜品ID数组
  status?: AppointmentStatus; // 预约状态
  userId?: string; // 用户ID
  openid?: string; // 用户openid
  remarks?: string; // 备注
  createTime: number; // 创建时间
  updateTime?: number; // 更新时间
}

// 冰箱食材
export interface InventoryItem {
  id: string; // 唯一ID
  name: string; // 食材名称
  amount: string; // 重量/数量
  userId?: string; // 用户ID
  openid?: string; // 用户openid
  category?: InventoryCategory; // 分类
  status?: InventoryStatus; // 状态
  putInDate: string; // 放入日期，格式：YYYY-MM-DD
  expiryDate: string; // 保质期，格式：YYYY-MM-DD
  createTime: number; // 创建时间
  updateTime?: number; // 更新时间
  remarks?: string; // 备注
  image?: string; // 食材图片，可选字段
} 