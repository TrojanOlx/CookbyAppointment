// 基础HTTP请求服务

const BASE_URL = 'https://wx.oulongxing.com';

// 请求方法类型
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// 请求参数接口
interface RequestOptions {
  url: string;
  method?: Method;
  data?: any;
  header?: Record<string, string>;
}

// 统一请求函数
export const request = <T = any>(options: RequestOptions): Promise<T> => {
  return new Promise((resolve, reject) => {
    // 获取本地存储的token
    const token = wx.getStorageSync('token') || '';
    
    // 合并默认header
    const header = {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.header
    };
    
    // 发起请求
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else if (res.statusCode === 401) {
          // token失效，清除本地token
          wx.removeStorageSync('token');
          // 跳转到登录页
          wx.navigateTo({ url: '/pages/login/login' });
          reject(new Error('登录已过期，请重新登录'));
        } else {
          reject(new Error(res.data.message || '请求失败'));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
};

// 封装GET请求
export const get = <T = any>(url: string, data?: any): Promise<T> => {
  return request<T>({
    url,
    method: 'GET',
    data
  });
};

// 封装POST请求
export const post = <T = any>(url: string, data?: any): Promise<T> => {
  return request<T>({
    url,
    method: 'POST',
    data
  });
};

// 封装PUT请求
export const put = <T = any>(url: string, data?: any): Promise<T> => {
  return request<T>({
    url,
    method: 'PUT',
    data
  });
};

// 封装DELETE请求
export const del = <T = any>(url: string, data?: any): Promise<T> => {
  return request<T>({
    url,
    method: 'DELETE',
    data
  });
}; 