// 菜品相关数据模型

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

// 食材
export interface Ingredient {
  id: string;           // 食材ID，数据库主键
  name: string;         // 名称
  amount: string;       // 数量/重量
  dishId?: string;      // 关联的菜品ID（可选）
  createTime?: number;  // 创建时间（可选）
  updateTime?: number;  // 更新时间（可选）
}

// 菜品
export interface Dish {
  id: string;           // 唯一ID，数据库主键
  name: string;         // 菜品名称
  type: DishType;       // 菜品类型
  spicy: SpicyLevel;    // 辣度
  images: string[];     // 图片数组
  ingredients: Ingredient[]; // 所需原料
  steps: string[];      // 制作步骤
  createTime: number;   // 创建时间
  notice?: string;      // 注意事项（可选）
  remark?: string;      // 备注（可选）
  reference?: string;   // 参考链接（可选）
  creatorId?: string;   // 创建者ID（可选）
  creatorOpenid?: string; // 创建者openid（可选）
  updateTime?: number;  // 更新时间（可选）
} 