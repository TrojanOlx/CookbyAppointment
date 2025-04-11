// 菜品类型
export enum DishType {
  Stir = '炒菜',
  Vegetable = '青菜',
  Soup = '炖汤'
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
  createTime: number; // 创建时间
}

// 预约记录
export interface Appointment {
  id: string; // 唯一ID
  date: string; // 日期，格式：YYYY-MM-DD
  mealType: MealType; // 餐次
  dishes: string[]; // 菜品ID数组
  createTime: number; // 创建时间
}

// 冰箱食材
export interface InventoryItem {
  id: string; // 唯一ID
  name: string; // 食材名称
  amount: string; // 重量/数量
  putInDate: string; // 放入日期，格式：YYYY-MM-DD
  expiryDate: string; // 保质期，格式：YYYY-MM-DD
  createTime: number; // 创建时间
} 