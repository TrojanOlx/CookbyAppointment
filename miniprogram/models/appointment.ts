// 预约相关数据模型

import { Dish } from './dish';

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
  Completed = '已完成',
  Cancelled = '已取消'
}

// 预约记录
export interface Appointment {
  id: string;           // 唯一ID，数据库主键
  date: string;         // 日期，格式：YYYY-MM-DD
  mealType: MealType;   // 餐次
  dishes: Dish[];       // 完整菜品对象数组
  createTime: number;   // 创建时间
  userId?: string;      // 用户ID（可选）
  openid?: string;      // 用户openid（可选）
  status?: AppointmentStatus; // 预约状态（可选）
  remarks?: string;     // 备注（可选）
  updateTime?: number;  // 更新时间（可选）
}

// 预约菜品关联表
export interface AppointmentDish {
  id: string;           // 唯一ID，数据库主键
  appointmentId: string; // 关联的预约ID
  dishId: string;       // 关联的菜品ID
  createTime: number;   // 创建时间
}

// 评价
export interface Review {
  id: string;           // 唯一ID，数据库主键
  appointmentId: string; // 关联的预约ID
  userId: string;       // 用户ID
  openid: string;       // 用户openid
  dishId: string;       // 关联的菜品ID
  rating: number;       // 评分（1-5）
  content: string;      // 评价内容
  images: string[];     // 评价图片
  createTime: number;   // 创建时间
  updateTime: number;   // 更新时间
} 