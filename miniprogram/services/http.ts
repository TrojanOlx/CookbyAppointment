// 基础HTTP请求服务

// 根据运行环境自动切换 API 地址
// 开发环境：使用微信开发者工具 → 详情 → 本地设置 → 不校验合法域名
const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
export const BASE_URL = envVersion === 'develop'
  ? 'http://127.0.0.1:8787'          // 本地 wrangler dev 地址
  : 'https://wx.oulongxing.com';     // 线上生产地址（trial/release）

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
  wx.removeStorageSync('openid');
};

// ---------- 静默刷新 token ----------
// 刷新锁：避免多个并发请求同时触发刷新
let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

/**
 * 静默刷新 token：调用 wx.login() 获取新 code 后重新登录，返回新 token。
 * 多个并发请求同时遇到 401 时，只执行一次刷新，其余排队等待结果。
 */
const silentRefreshToken = (): Promise<string> => {
  if (_isRefreshing) {
    return new Promise((resolve, reject) => {
      _refreshQueue.push((token) => {
        token ? resolve(token) : reject(new Error('token 刷新失败'));
      });
    });
  }
  _isRefreshing = true;
  const flush = (token: string | null) => {
    _isRefreshing = false;
    _refreshQueue.forEach(cb => cb(token));
    _refreshQueue = [];
  };
  return new Promise((resolve, reject) => {
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          flush(null);
          reject(new Error('wx.login 未返回 code'));
          return;
        }
        wx.request({
          url: `${BASE_URL}/api/user/login`,
          method: 'POST',
          data: { code: loginRes.code },
          header: { 'Content-Type': 'application/json' },
          success: (res: any) => {
            if (res.statusCode === 200 && res.data && res.data.token) {
              const newToken: string = res.data.token;
              wx.setStorageSync('token', newToken);
              if (res.data.openid) wx.setStorageSync('openid', res.data.openid);
              flush(newToken);
              resolve(newToken);
            } else {
              flush(null);
              reject(new Error('自动登录失败'));
            }
          },
          fail: (err) => { flush(null); reject(err); }
        });
      },
      fail: (err) => { flush(null); reject(err); }
    });
  });
};

// 弹窗提示并跳转登录（仅在静默刷新也失败后才调用）
const handleUnauthorized = (statusCode: number) => {
  clearLoginInfo();
  const errMsg = statusCode === 401 ? '登录已过期，请重新登录' : '权限不足';
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const currentPath = `/${currentPage.route}`;
  if (!currentPath.includes('/pages/profile/profile')) {
    wx.setStorageSync('redirectUrl', currentPath);
  }
  wx.showModal({
    title: '提示',
    content: errMsg,
    showCancel: false,
    success: () => {
      getGlobalApp().globalData.eventBus.emit('initLoginPage');
      if (!currentPath.includes('/pages/profile/profile')) {
        wx.switchTab({ url: '/pages/profile/profile' });
      }
    }
  });
};

// 内部请求实现；allowRetry=true 时遇到 401 会先静默刷新 token 再重试一次
const doRequest = <T = any>(options: RequestOptions, allowRetry: boolean): Promise<T> => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    const header = {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.header
    };
    let data = options.data;
    if ((options.method === 'GET' || options.method === 'DELETE') && data) {
      data = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
    }
    console.log(`发起请求: ${options.method || 'GET'} ${options.url}`, data);
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data,
      header,
      success: (res: any) => {
        console.log(`请求响应: ${options.url}`, res.statusCode, res.data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else if (res.statusCode === 401 && allowRetry) {
          // 先静默刷新 token，成功后用新 token 重试原请求（仅重试一次）
          silentRefreshToken()
            .then(() => {
              doRequest<T>(options, false).then(resolve).catch(reject);
            })
            .catch(() => {
              handleUnauthorized(401);
              reject(new Error('登录已过期，请重新登录'));
            });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          // 重试后仍失败，或 403 权限不足（不重试）
          handleUnauthorized(res.statusCode);
          const errMsg = res.statusCode === 401 ? '登录已过期，请重新登录' : '权限不足';
          reject(new Error(errMsg));
        } else {
          const errMsg = res.data && res.data.message
            ? res.data.message
            : `请求失败(${res.statusCode})`;
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(new Error(errMsg));
        }
      },
      fail: (err) => {
        console.error(`请求失败: ${options.url}`, err);
        const errMsg = err.errMsg || '网络错误，请检查网络连接';
        wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
        reject(new Error(errMsg));
      }
    });
  });
};

// 统一请求函数（公开 API，默认允许静默刷新重试）
export const request = <T = any>(options: RequestOptions): Promise<T> => {
  return doRequest<T>(options, true);
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