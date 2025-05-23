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

// 获取全局应用实例
const getGlobalApp = (): WechatMiniprogram.App.Instance<{
  globalData: {
    eventBus: {
      emit: (event: string, ...args: any[]) => void;
    };
  };
}> => {
  return getApp();
};

// 清除所有登录相关信息
const clearLoginInfo = () => {
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  // 可能还有其他需要清除的登录信息，根据实际情况添加
};

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
    if ((options.method === 'GET' || options.method === 'DELETE') && data) {
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
          // token失效或权限不足，清除本地token和用户信息
          clearLoginInfo();
          
          // 构建错误信息
          const errMsg = res.statusCode === 401 ? '登录已过期，请重新登录' : '权限不足';
          
          // 保存当前页面路径
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          const currentPath = `/${currentPage.route}`;
          
          // 如果当前不在登录页面，则保存当前页面路径用于重新登录后跳回
          if (!currentPath.includes('/pages/profile/profile')) {
            wx.setStorageSync('redirectUrl', currentPath);
          }
          
          // 提示用户
          wx.showModal({
            title: '提示',
            content: errMsg,
            showCancel: false,
            success: () => {
              // 如果当前不在登录页面，则跳转到登录页面
              if (!currentPath.includes('/pages/profile/profile')) {
                // 发送事件通知登录页面需要初始化
                getGlobalApp().globalData.eventBus.emit('initLoginPage');
                wx.switchTab({
                  url: '/pages/profile/profile'
                });
              }
            }
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
export const del = <T = any>(url: string, params?: Record<string, any>): Promise<T> => {
  // 构建带查询参数的URL
  if (params) {
    const queryString = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    if (queryString) {
      url = url.includes('?') ? `${url}&${queryString}` : `${url}?${queryString}`;
    }
  }
  
  return request<T>({
    url,
    method: 'DELETE'
  });
};

export function upload<T>(url: string, filePath: string, formData: Record<string, any> = {}, header: Record<string, any> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    wx.uploadFile({
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      filePath,
      name: 'file',
      formData,
      header: {
        'content-type': 'multipart/form-data',
        'Authorization': token ? `Bearer ${token}` : '',
        ...header
      },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
} 