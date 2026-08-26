// 用户认证相关工具函数
import { SessionCacheService } from './sessionCache';

// 服务器URL，需要根据实际情况修改
const BASE_URL = 'https://wx.oulongxing.com';

// 存储用户登录态的key
const USER_TOKEN_KEY = 'token';
const LEGACY_USER_TOKEN_KEY = 'user_token';
const USER_INFO_KEY = 'userInfo';
const OPEN_ID_KEY = 'openid';
const LEGACY_SESSION_KEY = 'session_key';

// Incremented whenever the local login session is invalidated. Async responses
// capture this value and must not write data after it changes.
let authSessionGeneration = 0;

export const getAuthSessionGeneration = (): number => authSessionGeneration;

export const invalidateAuthSession = (): number => {
  authSessionGeneration += 1;
  return authSessionGeneration;
};

// 用户登录信息接口
export interface LoginResult {
  openid: string;
  unionid?: string;
  token: string;
  profileComplete?: boolean;
  missingProfileFields?: Array<'nickName' | 'avatarUrl'>;
}

// 用户信息接口
export interface UserInfo {
  nickName: string;
  avatarUrl: string;
  gender: number;
  country: string;
  province: string;
  city: string;
  language: string;
}

// 手机号信息接口
export interface PhoneNumberResult {
  phoneNumber: string;        // 用户绑定的手机号（国外手机号会有区号）
  purePhoneNumber: string;    // 没有区号的手机号
  countryCode: string;        // 区号
  watermark: {
    timestamp: number;
    appid: string;
  };
}

/**
 * 微信登录方法，返回登录凭证code
 * @returns Promise<string> 登录凭证code
 */
export const wxLogin = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code);
        } else {
          reject(new Error('登录失败: ' + res.errMsg));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

/**
 * 调用服务器接口，用code换取openid等信息
 * @param code 登录凭证
 * @returns Promise<LoginResult> 登录结果
 */
export const code2Session = async (
  code: string,
  expectedGeneration: number = getAuthSessionGeneration()
): Promise<LoginResult> => {
  try {
    const initialToken = String(wx.getStorageSync(USER_TOKEN_KEY) || '');
    const initialOpenId = String(wx.getStorageSync(OPEN_ID_KEY) || '');
    // 使用统一的多会话登录接口，服务端不会返回微信 session_key。
    const response = await requestWithLoading<LoginResult>({
      url: `${BASE_URL}/api/user/login`,
      method: 'POST',
      data: { code }
    }, '登录中...');

    if (
      expectedGeneration !== getAuthSessionGeneration()
      || String(wx.getStorageSync(USER_TOKEN_KEY) || '') !== initialToken
      || String(wx.getStorageSync(OPEN_ID_KEY) || '') !== initialOpenId
    ) {
      throw new Error('登录状态已变化，请重试');
    }

    if (response && response.openid && response.token) {
      // 保存登录信息
      wx.setStorageSync(OPEN_ID_KEY, response.openid);
      wx.setStorageSync(USER_TOKEN_KEY, response.token);
      wx.removeStorageSync(LEGACY_USER_TOKEN_KEY);
      wx.removeStorageSync(LEGACY_SESSION_KEY);
      return response;
    } else {
      throw new Error('服务器返回数据格式错误');
    }
  } catch (error) {
    console.error('code2Session失败:', error);
    throw error;
  }
};

/**
 * 获取用户手机号
 * 需要在button组件添加 open-type="getPhoneNumber" bindgetphonenumber="回调方法"
 * 回调方法中获取到code后，调用此方法发送到后端解析
 * @param code 手机号获取凭证
 * @returns Promise<PhoneNumberResult> 手机号信息
 */
export const getPhoneNumber = async (code: string): Promise<PhoneNumberResult> => {
  try {
    // 检查是否已登录
    if (!isLoggedIn()) {
      throw new Error('请先登录再获取手机号');
    }
    
    const openid = getOpenId();
    const token = String(wx.getStorageSync(USER_TOKEN_KEY) || '');
    const generation = getAuthSessionGeneration();
    
    // 调用后端接口获取手机号
    const response = await requestWithLoading<PhoneNumberResult>({
      url: `${BASE_URL}/api/getPhoneNumber`,
      method: 'POST',
      data: { 
        code,
        openid
      }
    }, '获取手机号中...');

    if (
      generation !== getAuthSessionGeneration()
      || String(wx.getStorageSync(USER_TOKEN_KEY) || '') !== token
      || getOpenId() !== openid
    ) {
      throw new Error('登录状态已变化，请重试');
    }
    
    if (response && response.phoneNumber) {
      // 保存手机号到本地存储
      wx.setStorageSync('phoneNumber', response.phoneNumber);
      return response;
    } else {
      throw new Error('获取手机号失败，服务器返回数据格式错误');
    }
  } catch (error) {
    console.error('获取手机号失败:', error);
    throw error;
  }
};

/**
 * 检查用户是否已登录
 * @returns boolean 是否已登录
 */
export const isLoggedIn = (): boolean => {
  return !!wx.getStorageSync(USER_TOKEN_KEY);
};

/**
 * 退出登录
 */
export const logout = (): void => {
  invalidateAuthSession();
  SessionCacheService.clear();
  [
    USER_TOKEN_KEY, LEGACY_USER_TOKEN_KEY, OPEN_ID_KEY, LEGACY_SESSION_KEY, USER_INFO_KEY,
    'phoneNumber', 'active_family_id', 'active_family', 'active_family_role', 'family_role',
    'redirectUrl', 'notifyAppointment', 'notifyReview',
    'dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'
  ].forEach(key => wx.removeStorageSync(key));
};

/**
 * 获取用户的openid
 * @returns string|null 用户openid
 */
export const getOpenId = (): string | null => {
  return wx.getStorageSync(OPEN_ID_KEY) || null;
};

/**
 * 检查是否已有用户信息
 * @returns boolean 是否已有用户信息
 */
export const hasUserInfo = (): boolean => {
  return !!wx.getStorageSync(USER_INFO_KEY);
};

/**
 * 获取存储的用户信息
 * @returns UserInfo|null 用户信息
 */
export const getStoredUserInfo = (): UserInfo | null => {
  return wx.getStorageSync(USER_INFO_KEY) || null;
};

/**
 * 封装微信请求，带加载提示
 * @param options 请求参数
 * @param loadingText 加载提示文字
 * @returns Promise<T> 请求结果
 */
export const requestWithLoading = <T>(
  options: WechatMiniprogram.RequestOption, 
  loadingText: string = '加载中...'
): Promise<T> => {
  wx.showLoading({ title: loadingText, mask: true });
  
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      timeout: options.timeout || 12_000,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const errorData = res.data as any;
          reject(new Error(errorData && errorData.message ? errorData.message : `请求失败(${res.statusCode})`));
          return;
        }
        
        // 判断返回的数据类型及字段
        const data = res.data as T;
        
        // 检查响应数据的格式
        if (data) {
          // 处理多种返回数据结构
          // 1. 登录返回的数据结构
          if ((data as any).openid !== undefined) {
            resolve(data);
            return;
          }
          
          // 2. 获取手机号返回的数据结构
          if ((data as any).phoneNumber !== undefined || (data as any).phone_info) {
            // 兼容直接返回数据或者包含在phone_info中的情况
            if ((data as any).phone_info) {
              resolve({
                phoneNumber: (data as any).phone_info.phoneNumber,
                purePhoneNumber: (data as any).phone_info.purePhoneNumber,
                countryCode: (data as any).phone_info.countryCode,
                watermark: (data as any).phone_info.watermark
              } as unknown as T);
            } else {
              resolve(data);
            }
            return;
          }
          
          // 3. 其他有效数据
          if ((data as any).errcode === 0 || (data as any).code === 0 || (data as any).success) {
            resolve(data);
            return;
          }
          
          // 4. 处理错误情况
          if ((data as any).errcode !== undefined && (data as any).errcode !== 0) {
            wx.showToast({
              title: (data as any).errmsg || '请求失败',
              icon: 'none'
            });
            reject(new Error((data as any).errmsg || '请求失败'));
            return;
          }
          
          // 5. 兜底方案，尝试解析返回的数据
          resolve(data);
        } else {
          wx.showToast({
            title: '数据格式错误',
            icon: 'none'
          });
          reject(new Error('数据格式错误'));
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({
          title: '网络异常，请稍后重试',
          icon: 'none'
        });
        reject(err);
      }
    });
  });
};

/**
 * 获取用户信息，需要先调用wx.login获取code，再调用code2Session
 * @returns Promise<LoginResult> 登录结果
 */
export const login = async (): Promise<LoginResult> => {
  try {
    const generation = getAuthSessionGeneration();
    const code = await wxLogin();
    console.log('获取code成功:', code);
    return await code2Session(code, generation);
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
};
