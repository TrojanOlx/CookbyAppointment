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
    
    // 处理GET请求参数，过滤掉undefined的值
    let data = options.data;
    if (options.method === 'GET' && data) {
      data = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
    }
    
    // 打印请求日志
    console.log(`发起请求: ${options.method || 'GET'} ${options.url}`, data);
    
    // 发起请求
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data,
      header,
      success: (res: any) => {
        // 打印响应日志
        console.log(`请求响应: ${options.url}`, res.statusCode, res.data);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          // token失效或权限不足，清除本地token
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          
          // 构建错误信息
          const errMsg = res.statusCode === 401 ? '登录已过期，请重新登录' : '权限不足';
          
          // 提示用户
          wx.showToast({
            title: errMsg,
            icon: 'none',
            duration: 2000
          });
          
          reject(new Error(errMsg));
        } else {
          // 其他错误类型
          const errMsg = res.data && res.data.message 
            ? res.data.message 
            : `请求失败(${res.statusCode})`;
            
          wx.showToast({
            title: errMsg,
            icon: 'none',
            duration: 2000
          });
          
          reject(new Error(errMsg));
        }
      },
      fail: (err) => {
        console.error(`请求失败: ${options.url}`, err);
        const errMsg = err.errMsg || '网络错误，请检查网络连接';
        
        wx.showToast({
          title: errMsg,
          icon: 'none',
          duration: 2000
        });
        
        reject(new Error(errMsg));
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