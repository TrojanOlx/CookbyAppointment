// 基础HTTP请求服务
import { ImageCacheService } from '../utils/imageCache';
import { invalidateAuthSession } from '../utils/auth';

// 根据运行环境自动切换 API 地址
// 开发环境：使用微信开发者工具 → 详情 → 本地设置 → 不校验合法域名
const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
export const BASE_URL = envVersion === 'develop'
  ? 'https://wx.oulongxing.com'      // 开发环境直连线上 API（无需本地 wrangler dev）
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

const withoutAuthorization = <T extends Record<string, any>>(header?: T): T => {
  if (!header) return {} as T;
  return Object.fromEntries(
    Object.entries(header).filter(([key]) => key.toLowerCase() !== 'authorization')
  ) as T;
};

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
  invalidateAuthSession();
  [
    'token', 'user_token', 'session_key', 'userInfo', 'openid', 'phoneNumber',
    'active_family_id', 'active_family', 'active_family_role', 'family_role',
    'redirectUrl', 'notifyAppointment', 'notifyReview',
    'dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'
  ].forEach(key => wx.removeStorageSync(key));
  void ImageCacheService.clear().catch(error => console.warn('退出后图片缓存清理失败:', error));
};

const getFamilyId = (): string => {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') {
    return String(value.id || value.familyId || value.family_id || '');
  }
  return value ? String(value) : '';
};

const getAppVersion = (): string => {
  try {
    return wx.getAccountInfoSync().miniProgram.version || '2.1.0-dev';
  } catch {
    return '2.1.0-dev';
  }
};

// ---------- 静默刷新 token ----------
// 每个旧 token 独立复用刷新请求，避免旧账号的刷新锁干扰新登录。
const refreshPromises = new Map<string, Promise<string>>();

/**
 * 静默刷新 token：调用 wx.login() 获取新 code 后重新登录，返回新 token。
 * 多个并发请求同时遇到 401 时，只执行一次刷新，其余排队等待结果。
 */
const silentRefreshToken = (expectedToken: string): Promise<string> => {
  const currentToken = String(wx.getStorageSync('token') || '');
  if (!expectedToken || currentToken !== expectedToken) {
    return Promise.reject(new Error('登录状态已变化，请重试'));
  }
  const pending = refreshPromises.get(expectedToken);
  if (pending) return pending;

  const refreshPromise = new Promise<string>((resolve, reject) => {
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
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
              if (String(wx.getStorageSync('token') || '') !== expectedToken) {
                reject(new Error('登录状态已变化，请重试'));
                return;
              }
              const newToken: string = res.data.token;
              wx.setStorageSync('token', newToken);
              if (res.data.openid) wx.setStorageSync('openid', res.data.openid);
              resolve(newToken);
            } else {
              reject(new Error('自动登录失败'));
            }
          },
          fail: reject
        });
      },
      fail: reject
    });
  });
  refreshPromises.set(expectedToken, refreshPromise);
  const releaseRefresh = () => {
    if (refreshPromises.get(expectedToken) === refreshPromise) refreshPromises.delete(expectedToken);
  };
  void refreshPromise.then(releaseRefresh, releaseRefresh);
  return refreshPromise;
};

// 弹窗提示并跳转登录（仅在静默刷新也失败后才调用）
const handleUnauthorized = (statusCode: number, expectedToken: string): boolean => {
  if (!expectedToken || String(wx.getStorageSync('token') || '') !== expectedToken) {
    return false;
  }
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
  return true;
};

// 内部请求实现；allowRetry=true 时遇到 401 会先静默刷新 token 再重试一次
const doRequest = <T = any>(options: RequestOptions, allowRetry: boolean): Promise<T> => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    const familyId = getFamilyId();
    const header = {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      'X-App-Version': getAppVersion(),
      ...(familyId ? { 'X-Family-Id': familyId } : {}),
      ...withoutAuthorization(options.header)
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
          if (String(wx.getStorageSync('token') || '') !== String(token) || getFamilyId() !== familyId) {
            reject(new Error('登录状态或家庭已变化，请重试'));
            return;
          }
          resolve(res.data as T);
        } else if (res.statusCode === 401 && allowRetry) {
          if (!token || String(wx.getStorageSync('token') || '') !== token) {
            reject(new Error('登录状态已变化，请重试'));
            return;
          }
          // 先静默刷新 token，成功后用新 token 重试原请求（仅重试一次）
          silentRefreshToken(token)
            .then((refreshedToken) => {
              if (String(wx.getStorageSync('token') || '') !== refreshedToken) {
                throw new Error('登录状态已变化，请重试');
              }
              if (getFamilyId() !== familyId) {
                throw new Error('家庭已切换，请重试');
              }
              doRequest<T>({ ...options, header: withoutAuthorization(options.header) }, false)
                .then(resolve)
                .catch(reject);
            })
            .catch((error) => {
              const handled = handleUnauthorized(401, token);
              reject(handled ? new Error('登录已过期，请重新登录') : error);
            });
        } else if (res.statusCode === 401) {
          // 静默刷新重试后仍失败，清理失效登录态。
          const handled = handleUnauthorized(401, token);
          reject(new Error(handled ? '登录已过期，请重新登录' : '登录状态已变化，请重试'));
        } else if (res.statusCode === 403) {
          // RBAC 拒绝不代表登录失效，保留会话和当前家庭。
          const errMsg = res.data && res.data.message ? res.data.message : '权限不足';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
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
  const attempt = (allowRetry: boolean): Promise<T> => new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    const familyId = getFamilyId();
    wx.uploadFile({
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      filePath,
      name: 'file',
      formData,
      header: {
        'content-type': 'multipart/form-data',
        'Authorization': token ? `Bearer ${token}` : '',
        'X-App-Version': getAppVersion(),
        ...(familyId ? { 'X-Family-Id': familyId } : {}),
        ...withoutAuthorization(header)
      },
      success(res) {
        let body: any = res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch {
            body = null;
          }
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (String(wx.getStorageSync('token') || '') !== String(token) || getFamilyId() !== familyId) {
            reject(new Error('登录状态或家庭已变化，请重试'));
            return;
          }
          if (body === null || body === undefined) {
            reject(new Error('上传响应无效'));
          } else {
            resolve(body as T);
          }
          return;
        }

        const message = body && typeof body.message === 'string'
          ? body.message
          : `请求失败(${res.statusCode})`;
        if (res.statusCode === 401 && allowRetry) {
          if (!token || String(wx.getStorageSync('token') || '') !== token) {
            reject(new Error('登录状态已变化，请重试'));
            return;
          }
          silentRefreshToken(token)
            .then((refreshedToken) => {
              if (String(wx.getStorageSync('token') || '') !== refreshedToken) {
                throw new Error('登录状态已变化，请重试');
              }
              if (getFamilyId() !== familyId) {
                throw new Error('家庭已切换，请重试');
              }
              return attempt(false);
            })
            .then(resolve)
            .catch((error) => {
              const handled = handleUnauthorized(401, token);
              reject(handled ? new Error('登录已过期，请重新登录') : error);
            });
          return;
        }
        if (res.statusCode === 401) {
          const handled = handleUnauthorized(401, token);
          reject(new Error(handled ? '登录已过期，请重新登录' : '登录状态已变化，请重试'));
          return;
        }
        if (res.statusCode === 403) {
          wx.showToast({ title: message, icon: 'none', duration: 2000 });
          reject(new Error(message));
          return;
        }
        if (res.statusCode === 426) {
          wx.showModal({ title: '需要更新', content: message, showCancel: false });
        } else {
          wx.showToast({ title: message, icon: 'none', duration: 2000 });
        }
        reject(new Error(message));
      },
      fail(err) {
        reject(err);
      }
    });
  });

  return attempt(true);
}
