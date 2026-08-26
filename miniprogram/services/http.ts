// 基础HTTP请求服务
import { getAuthSessionGeneration, invalidateAuthSession } from '../utils/auth';
import { SESSION_CACHE_TTL, SessionCacheService, SessionResource } from '../utils/sessionCache';

// 根据运行环境自动切换 API 地址
// 开发环境：使用微信开发者工具 → 详情 → 本地设置 → 不校验合法域名
const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
export const BASE_URL = envVersion === 'develop'
  ? 'https://wx.oulongxing.com'      // 开发环境直连线上 API（无需本地 wrangler dev）
  : 'https://wx.oulongxing.com';     // 线上生产地址（trial/release）

// 请求方法类型
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// 请求参数接口
export interface RequestOptions {
  url: string;
  method?: Method;
  data?: any;
  header?: Record<string, string>;
  timeout?: number;
  dedupe?: boolean;
}

export interface CachedGetOptions {
  resource: SessionResource;
  ttlMs: number;
  force?: boolean;
}

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;
  retriable: boolean;

  constructor(message: string, options: {
    status?: number;
    code?: string;
    details?: unknown;
    requestId?: string;
    retriable?: boolean;
  } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = options.status || 0;
    this.code = options.code || 'REQUEST_FAILED';
    this.details = options.details;
    this.requestId = options.requestId;
    this.retriable = options.retriable ?? (this.status === 0 || this.status >= 500);
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const inFlightGets = new Map<string, Promise<unknown>>();

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && item !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return String(value);
};

const resourceForUrl = (url: string): SessionResource | undefined => {
  if (url.includes('/inventory/')) return 'inventory';
  if (url.includes('/appointment/')) return 'appointment';
  if (url.includes('/shopping/')) return 'shopping';
  if (url.includes('/dish/')) return 'dish';
  if (url.includes('/family/')) return 'family';
  if (url.includes('/user/') || url.includes('/platform/status')) return 'profile';
  return undefined;
};

const requestIdentity = (url: string, data?: unknown): string => [
  getAuthSessionGeneration(),
  getFamilyId(),
  SessionCacheService.generation(resourceForUrl(url)),
  url,
  stableSerialize(data),
].join('|');

const resourcesForMutation = (url: string): SessionResource[] => {
  if (url.includes('/inventory/')) return ['inventory', 'home', 'dish'];
  if (url.includes('/appointment/')) return ['appointment', 'shopping', 'inventory', 'home'];
  if (url.includes('/shopping/')) return ['shopping', 'inventory', 'home'];
  if (url.includes('/dish/') || url.includes('/recipe-template')) return ['dish', 'home'];
  if (url.includes('/family/')) return ['family', 'home', 'dish', 'inventory', 'appointment', 'shopping'];
  if (url.includes('/user/')) return ['profile', 'family', 'dish'];
  return [];
};

const cachePolicyForUrl = (url: string): { resource: SessionResource; ttlMs: number } | null => {
  const resource = resourceForUrl(url);
  return resource ? { resource, ttlMs: SESSION_CACHE_TTL[resource as keyof typeof SESSION_CACHE_TTL] || 60_000 } : null;
};

const responseRequestId = (res: any): string | undefined => {
  const headers = res && res.header ? res.header : {};
  return headers['x-request-id'] || headers['X-Request-Id'] || headers['X-Request-ID'];
};

const toHttpError = (res: any, fallback: string): HttpError => {
  const body = res && res.data && typeof res.data === 'object' ? res.data : {};
  return new HttpError(typeof body.message === 'string' ? body.message : fallback, {
    status: Number(res && res.statusCode) || 0,
    code: typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
    details: body.details,
    requestId: responseRequestId(res),
  });
};

const asHttpError = (error: unknown): HttpError => {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : String(error || '请求失败');
  return new HttpError(message, {
    code: message.includes('登录状态') || message.includes('家庭已切换') ? 'SESSION_CHANGED' : 'REQUEST_FAILED',
  });
};

const withoutAuthorization = <T extends Record<string, any>>(header?: T): T => {
  if (!header) return {} as T;
  return Object.fromEntries(
    Object.entries(header).filter(([key]) => !['authorization', 'x-family-id'].includes(key.toLowerCase()))
  ) as T;
};

const logPath = (url: string): string => {
  try {
    return new URL(url, BASE_URL).pathname;
  } catch {
    return url.split('?')[0];
  }
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
  SessionCacheService.clear();
  inFlightGets.clear();
  [
    'token', 'user_token', 'session_key', 'userInfo', 'openid', 'phoneNumber',
    'active_family_id', 'active_family', 'active_family_role', 'family_role',
    'redirectUrl', 'notifyAppointment', 'notifyReview',
    'dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'
  ].forEach(key => wx.removeStorageSync(key));
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
    return wx.getAccountInfoSync().miniProgram.version || '1.0.3-dev';
  } catch {
    return '1.0.3-dev';
  }
};

const getCurrentPageUrl = (): string => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1] as (WechatMiniprogram.Page.Instance<
    Record<string, unknown>,
    Record<string, unknown>
  > & { route?: string; options?: Record<string, unknown> }) | undefined;
  const route = String(currentPage && currentPage.route || '').replace(/^\/+/, '');
  if (!route) return '/pages/profile/profile';

  const query = Object.entries(currentPage && currentPage.options || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `/${route}${query ? `?${query}` : ''}`;
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
          timeout: DEFAULT_TIMEOUT_MS,
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
  const currentUrl = getCurrentPageUrl();
  if (!currentUrl.startsWith('/pages/profile/profile')) {
    wx.setStorageSync('redirectUrl', currentUrl);
  }
  wx.showModal({
    title: '提示',
    content: errMsg,
    showCancel: false,
    success: () => {
      getGlobalApp().globalData.eventBus.emit('initLoginPage');
      if (!currentUrl.startsWith('/pages/profile/profile')) {
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
    const method = options.method || 'GET';
    const startedAt = Date.now();
    if (envVersion === 'develop') {
      console.info(`[http] ${method} ${logPath(options.url)}`);
    }
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method,
      data,
      header,
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      success: (res: any) => {
        if (envVersion === 'develop') {
          console.info(`[http] ${method} ${logPath(options.url)} ${res.statusCode} ${Date.now() - startedAt}ms ${responseRequestId(res) || ''}`);
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (String(wx.getStorageSync('token') || '') !== String(token) || getFamilyId() !== familyId) {
            reject(new HttpError('登录状态或家庭已变化，请重试', { code: 'SESSION_CHANGED' }));
            return;
          }
          if (method !== 'GET') {
            SessionCacheService.markDirty(...resourcesForMutation(options.url));
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
              reject(handled ? new HttpError('登录已过期，请重新登录', { status: 401, code: 'UNAUTHORIZED' }) : error);
            });
        } else if (res.statusCode === 401) {
          // 静默刷新重试后仍失败，清理失效登录态。
          const handled = handleUnauthorized(401, token);
          reject(new HttpError(handled ? '登录已过期，请重新登录' : '登录状态已变化，请重试', {
            status: 401,
            code: handled ? 'UNAUTHORIZED' : 'SESSION_CHANGED',
          }));
        } else if (res.statusCode === 403 && res.data && res.data.code === 'ACCOUNT_SUSPENDED') {
          const error = toHttpError(res, '账号已停用');
          if (token && String(wx.getStorageSync('token') || '') === String(token)) {
            clearLoginInfo();
            wx.showModal({ title: '账号已停用', content: error.message, showCancel: false });
          }
          reject(error);
        } else {
          reject(toHttpError(res, `请求失败(${res.statusCode})`));
        }
      },
      fail: (err) => {
        if (envVersion === 'develop') {
          const failureStatus = err && err.errMsg && err.errMsg.includes('timeout') ? 'TIMEOUT' : 'NETWORK_ERROR';
          console.warn(`[http] ${method} ${logPath(options.url)} ${failureStatus} ${Date.now() - startedAt}ms`);
        }
        const message = err && err.errMsg && err.errMsg.includes('timeout')
          ? '请求超时，请稍后重试'
          : (err && err.errMsg) || '网络错误，请检查网络连接';
        reject(new HttpError(message, {
          code: err && err.errMsg && err.errMsg.includes('timeout') ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          retriable: true,
        }));
      }
    });
  });
};

// 统一请求函数（公开 API，默认允许静默刷新重试）
export const request = <T = any>(options: RequestOptions): Promise<T> => {
  const method = options.method || 'GET';
  if (method !== 'GET' || options.dedupe === false) {
    return doRequest<T>(options, true).catch(error => Promise.reject(asHttpError(error)));
  }
  const key = requestIdentity(options.url, options.data);
  const existing = inFlightGets.get(key);
  if (existing) return existing as Promise<T>;
  const pending = doRequest<T>(options, true).catch(error => Promise.reject(asHttpError(error)));
  inFlightGets.set(key, pending);
  const release = () => {
    if (inFlightGets.get(key) === pending) inFlightGets.delete(key);
  };
  void pending.then(release, release);
  return pending;
};

// 封装GET请求
export const get = <T = any>(url: string, data?: any, options: { force?: boolean; cache?: boolean } = {}): Promise<T> => {
  const policy = cachePolicyForUrl(url);
  if (policy && options.cache !== false) {
    return getCached<T>(url, data, { ...policy, force: options.force });
  }
  return request<T>({ url, method: 'GET', data, dedupe: !options.force });
};

export const getCached = async <T = any>(
  url: string,
  data: any,
  options: CachedGetOptions
): Promise<T> => {
  const load = async (allowRetryAfterMutation: boolean): Promise<T> => {
    const generation = SessionCacheService.generation(options.resource);
    const key = requestIdentity(url, data);
    if (!options.force) {
      const cached = SessionCacheService.get<T>(key, options.resource);
      if (cached !== undefined) return cached;
    }
    const value = await request<T>({
      url,
      method: 'GET',
      data,
      dedupe: !options.force,
    });
    if (generation !== SessionCacheService.generation(options.resource)) {
      if (allowRetryAfterMutation) return load(false);
      throw new HttpError('数据正在更新，请重试', { code: 'RESOURCE_CHANGED', retriable: true });
    }
    return SessionCacheService.set(key, options.resource, value, options.ttlMs);
  };
  return load(true);
};

export const markSessionResourceDirty = (...resources: SessionResource[]): void => {
  SessionCacheService.markDirty(...resources);
};

export const clearSessionCache = (resource?: SessionResource): void => {
  SessionCacheService.clear(resource);
  if (!resource) inFlightGets.clear();
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
      timeout: DEFAULT_TIMEOUT_MS,
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
            reject(new HttpError('登录状态或家庭已变化，请重试', { code: 'SESSION_CHANGED' }));
            return;
          }
          if (body === null || body === undefined) {
            reject(new HttpError('上传响应无效', { status: res.statusCode, code: 'INVALID_RESPONSE' }));
          } else {
            SessionCacheService.markDirty(...resourcesForMutation(url));
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
              reject(handled ? new HttpError('登录已过期，请重新登录', { status: 401, code: 'UNAUTHORIZED' }) : error);
            });
          return;
        }
        if (res.statusCode === 401) {
          const handled = handleUnauthorized(401, token);
          reject(new HttpError(handled ? '登录已过期，请重新登录' : '登录状态已变化，请重试', {
            status: 401,
            code: handled ? 'UNAUTHORIZED' : 'SESSION_CHANGED',
          }));
          return;
        }
        const error = new HttpError(message, {
          status: res.statusCode,
          code: body && typeof body.code === 'string' ? body.code : 'UPLOAD_FAILED',
          details: body && body.details,
          retriable: res.statusCode >= 500,
        });
        if (res.statusCode === 403 && error.code === 'ACCOUNT_SUSPENDED') {
          if (token && String(wx.getStorageSync('token') || '') === String(token)) {
            clearLoginInfo();
            wx.showModal({ title: '账号已停用', content: error.message, showCancel: false });
          }
          reject(error);
          return;
        }
        reject(error);
      },
      fail(err) {
        const message = err && err.errMsg && err.errMsg.includes('timeout')
          ? '上传超时，请稍后重试'
          : (err && err.errMsg) || '上传失败，请检查网络连接';
        reject(new HttpError(message, {
          code: err && err.errMsg && err.errMsg.includes('timeout') ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          retriable: true,
        }));
      }
    });
  });

  return attempt(true).catch(error => Promise.reject(asHttpError(error)));
}
