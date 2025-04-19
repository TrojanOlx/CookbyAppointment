// 用户服务
import { get, post, put, del } from './http';
import { User, LoginInfo, UserPhone } from '../models/user';

// 登录接口响应
interface LoginResponse {
  openid: string;
  session_key: string;
  unionid?: string;
  token?: string;
}

// 用户服务类
export class UserService {
  // 微信登录
  static async login(code: string): Promise<LoginResponse> {
    return post<LoginResponse>('/api/user/login', { code });
  }

  // 获取用户手机号
  static async getPhoneNumber(code: string): Promise<UserPhone> {
    return post<UserPhone>('/api/user/phone', { code });
  }

  // 获取用户信息
  static async getUserInfo(userId?: string): Promise<User> {
    return get<User>('/api/user/info', { userId });
  }

  // 更新用户信息
  static async updateUserInfo(user: Partial<User>): Promise<User> {
    return put<User>('/api/user/info', user);
  }

  // 检查是否为管理员
  static async checkAdmin(): Promise<{ isAdmin: boolean }> {
    return get<{ isAdmin: boolean }>('/api/user/admin');
  }

  // 获取用户列表（仅管理员）
  static async getUserList(page: number = 1, pageSize: number = 10): Promise<{ total: number, list: User[] }> {
    return get<{ total: number, list: User[] }>('/api/user/list', { page, pageSize });
  }
} 