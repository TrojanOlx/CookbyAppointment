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
      url: `${BASE_URL}`,
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
    console.error('code2Session失败1111:', error);
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
        // 这里假设后端返回的数据格式为 { code: number, data: T, msg: string }
        console.log("后端返回数据");
        console.log(res.data);
        const result = res.data as { code: number; data: T; msg: string };
        if (result.code === 0 || result.code === 200) {
          resolve(result.data);
        } else {
          wx.showToast({
            title: result.msg || '请求失败',
            icon: 'none'
          });
          reject(new Error(result.msg || '请求失败'));
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