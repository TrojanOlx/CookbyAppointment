// 用户认证相关工具函数

// 服务器URL，需要根据实际情况修改
const BASE_URL = 'https://wx.oulongxing.com';

// 存储用户登录态的key
const USER_TOKEN_KEY = 'user_token';
const USER_INFO_KEY = 'userInfo';
const OPEN_ID_KEY = 'openid';
const SESSION_KEY = 'session_key';

// 用户登录信息接口
export interface LoginResult {
  openid: string;
  session_key: string;
  unionid?: string;
  token?: string;
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

/**
 * 微信登录方法，返回登录凭证code
 * @returns Promise<string> 登录凭证code
 */
export const wxLogin = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          console.log('获取code成功:', res.code);
          resolve(res.code);
        } else {
          console.error('登录失败:', res.errMsg);
          reject(new Error('登录失败: ' + res.errMsg));
        }
      },
      fail: (err) => {
        console.error('wx.login调用失败:', err);
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
export const code2Session = async (code: string): Promise<LoginResult> => {
  try {
    console.log('开始请求后端:');
    
    // 这里假设后端有一个/api/login接口，接收code并返回openid等信息
    const response = await requestWithLoading<LoginResult>({
      url: `${BASE_URL}/api/getUserProfile`,
      method: 'POST',
      data: { code }
    }, '登录中...');

    console.log(response);
    if (response) {
      // 保存登录信息
      wx.setStorageSync(OPEN_ID_KEY, response.openid);
      wx.setStorageSync(SESSION_KEY, response.session_key);
      if (response.token) {
        wx.setStorageSync(USER_TOKEN_KEY, response.token);
      }
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
 * 检查用户是否已登录
 * @returns boolean 是否已登录
 */
export const isLoggedIn = (): boolean => {
  return !!wx.getStorageSync(OPEN_ID_KEY);
};

/**
 * 退出登录
 */
export const logout = (): void => {
  wx.removeStorageSync(USER_TOKEN_KEY);
  wx.removeStorageSync(OPEN_ID_KEY);
  wx.removeStorageSync(SESSION_KEY);
  wx.removeStorageSync(USER_INFO_KEY);
};

/**
 * 获取用户的openid
 * @returns string|null 用户openid
 */
export const getOpenId = (): string | null => {
  return wx.getStorageSync(OPEN_ID_KEY) || null;
};

/**
 * 获取用户信息
 * 【注意】: 此函数必须由用户点击事件直接触发，不能在onLoad等生命周期函数中自动调用
 * 微信规定wx.getUserProfile必须由用户点击操作触发，如按钮的bindtap事件
 * 
 * 使用示例:
 * <button bindtap="getUserProfile">获取用户信息</button>
 * 
 * 在Page中的方法:
 * getUserProfile() {
 *   getUserProfile().then(userInfo => {
 *     // 处理用户信息
 *   }).catch(err => {
 *     console.error(err);
 *   });
 * }
 * 
 * @returns Promise<UserInfo> 用户信息
 */
export const getUserProfile = (): Promise<UserInfo> => {
  return new Promise((resolve, reject) => {
    // 必须在用户点击按钮等主动操作后调用
    wx.getUserProfile({
      desc: '用于完善用户资料', // 声明获取用户信息后的用途
      success: (res) => {
        console.log('获取用户信息成功:', res.userInfo);
        // 将用户信息存储到本地
        wx.setStorageSync(USER_INFO_KEY, res.userInfo);
        resolve(res.userInfo);
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
        wx.showToast({
          title: '获取用户信息失败',
          icon: 'none'
        });
        reject(err);
      }
    });
  });
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
      success: (res) => {
        wx.hideLoading();
        console.log("后端返回数据");
        console.log(res.data);
        
        // 后端直接返回 {session_key: string, openid: string} 格式
        const data = res.data as T;
        
        // 检查数据是否包含必要的字段
        if (data && (data as any).openid) {
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
    const code = await wxLogin();
    console.log('获取code成功:', code);
    return await code2Session(code);
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
}; 