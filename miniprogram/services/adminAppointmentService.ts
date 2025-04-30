// 管理员预约服务
import { get, post } from './http';
import { Appointment } from '../models/appointment';

// 管理员预约服务类，用于管理员操作预约
export class AdminAppointmentService {
  // 获取所有用户的预约列表
  static async getAllAppointments(
    page: number = 1, 
    pageSize: number = 10, 
    status?: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ total: number, list: Appointment[] }> {
    return get<{ total: number, list: Appointment[] }>('/api/admin/appointment/list', { 
      page, 
      pageSize, 
      status,
      startDate,
      endDate
    });
  }

  // 获取指定日期所有用户的预约列表（包含用户信息和菜品详情）
  static async getDateAppointments(
    page: number = 1, 
    pageSize: number = 50, 
    date: string,
    status?: string
  ): Promise<{ total: number, list: Array<Appointment & { 
    userName: string, 
    userPhone: string,
    userAvatar: string,
    dishes: any[]
  }> }> {
    return get<{ 
      total: number, 
      list: Array<Appointment & { 
        userName: string, 
        userPhone: string,
        userAvatar: string,
        dishes: any[]
      }> 
    }>('/api/admin/appointment/date', { 
      page, 
      pageSize, 
      date,
      status
    });
  }
} 