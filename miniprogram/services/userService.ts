// 用户服务
import { get, post, put, del, upload } from './http';
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
    // 如果userId未定义或为空字符串，则获取当前登录用户信息
    if (!userId) {
      return get<User>('/api/user/info');
    }
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

  // 上传并更新用户头像
  static async updateAvatar(localPath: string): Promise<{ filePath: string, url: string }> {
    return upload<{ filePath: string, url: string }>(
      '/api/user/avatar',
      localPath,
      { fileName: localPath.split('/').pop() || 'avatar.jpg' }
    );
  }
} 