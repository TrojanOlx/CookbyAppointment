// 预约服务
import { get, post, put, del } from './http';
import { Appointment, AppointmentDish, Review } from '../models/appointment';

// 预约服务类
export class AppointmentService {
  // 获取预约列表
  static async getAppointmentList(
    page: number = 1, 
    pageSize: number = 10, 
    status?: string,
    date?: string
  ): Promise<{ total: number, list: Appointment[] }> {
    return get<{ total: number, list: Appointment[] }>('/api/appointment/list', { 
      page, 
      pageSize, 
      status,
      date
    });
  }

  // 获取指定日期预约列表
  static async getAppointmentListByDate(
    date: string,
    status?: string
  ): Promise<{ total: number, list: Appointment[] }> {
    return get<{ total: number, list: Appointment[] }>('/api/appointment/date', { 
      date,
      status
    });
  }

  // 获取预约详情
  static async getAppointmentDetail(id: string): Promise<Appointment> {
    return get<Appointment>('/api/appointment/detail', { id });
  }

  // 创建预约
  static async createAppointment(appointment: Partial<Appointment>): Promise<Appointment> {
    return post<Appointment>('/api/appointment/create', appointment);
  }

  // 更新预约
  static async updateAppointment(appointment: Partial<Appointment>): Promise<Appointment> {
    return put<Appointment>('/api/appointment/update', appointment);
  }

  // 取消预约
  static async cancelAppointment(id: string, reason?: string): Promise<{ success: boolean }> {
    return put<{ success: boolean }>('/api/appointment/cancel', { id, reason });
  }

  // 确认预约
  static async confirmAppointment(id: string): Promise<{ success: boolean }> {
    return put<{ success: boolean }>('/api/appointment/confirm', { id });
  }

  // 完成预约
  static async completeAppointment(id: string): Promise<{ success: boolean }> {
    return put<{ success: boolean }>('/api/appointment/complete', { id });
  }

  // 获取预约菜品关联
  static async getAppointmentDishes(appointmentId: string): Promise<AppointmentDish[]> {
    return get<AppointmentDish[]>('/api/appointment/dishes', { appointmentId });
  }

  // 添加预约菜品关联
  static async addAppointmentDish(appointmentDish: Partial<AppointmentDish>): Promise<AppointmentDish> {
    return post<AppointmentDish>('/api/appointment/dish/add', appointmentDish);
  }

  // 删除预约菜品关联
  static async removeAppointmentDish(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/api/appointment/dish/remove', { id });
  }

  // 获取评价列表
  static async getReviewList(
    page: number = 1, 
    pageSize: number = 10, 
    dishId?: string,
    userId?: string
  ): Promise<{ total: number, list: Review[] }> {
    return get<{ total: number, list: Review[] }>('/api/review/list', { 
      page, 
      pageSize, 
      dishId,
      userId
    });
  }

  // 添加评价
  static async addReview(review: Partial<Review>): Promise<Review> {
    return post<Review>('/api/review/add', review);
  }

  // 更新评价
  static async updateReview(review: Partial<Review>): Promise<Review> {
    return put<Review>('/api/review/update', review);
  }

  // 删除评价
  static async deleteReview(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/api/review/delete', { id });
  }
} 