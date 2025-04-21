// app.ts
import { initTestData } from './utils/storage';
import { hasUserAcceptedPrivacy, requestPrivacyAuthorization } from './utils/privacy';
import { isLoggedIn } from './utils/auth';

// 需要登录才能访问的页面路径
const needLoginPages = [
  "pages/menu/menu",
  "pages/menu/add/add",
  "pages/menu/detail/detail",
  "pages/appointment/appointment",
  "pages/appointment/select/select",
  "pages/inventory/inventory",
  "pages/inventory/add/add",
  "pages/appointment/listtest", 
  "pages/profile/appointments/appointments",
  "pages/profile/reviews/reviews",
  "pages/profile/admin/appointments",
  "pages/profile/admin/reviews",
  "pages/profile/admin/statistics",
  "pages/profile/settings/settings",
  "pages/profile/admin/appointments/appointments",
  "pages/profile/admin/reviews/reviews",
  "pages/profile/admin/statistics/statistics"
];

App({
  globalData: {
    systemInfo: null as WechatMiniprogram.SystemInfo | null,
    needLoginPages: needLoginPages
  },
  
  onLaunch() {
    // 获取系统信息
    wx.getSystemInfo({
      success: res => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      }
    });
    
    // 初始化测试数据
    initTestData();
    
    // 处理隐私授权
    if (!hasUserAcceptedPrivacy()) {
      // 如果用户未接受隐私政策，引导到隐私政策页面
      wx.navigateTo({
        url: '/pages/privacy/privacy'
      });
    }
    
    // 注册全局页面跳转拦截
    this.registerPageInterceptor();
  },
  
  // 注册页面跳转拦截器
  registerPageInterceptor() {
    // 重写wx.navigateTo方法
    const originalNavigateTo = wx.navigateTo;
    Object.defineProperty(wx, 'navigateTo', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: <T extends WechatMiniprogram.NavigateToOption>(options: T) => {
        const { url } = options;
        const path = this.getPathFromUrl(url);
        
        if (this.needLogin(path) && !isLoggedIn()) {
          // 保存原始要跳转的路径，登录后可以返回
          wx.setStorageSync('redirectUrl', url);
          
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          
          // 跳转到登录页
          return new Promise<WechatMiniprogram.NavigateToSuccessCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (res) => {
                  resolve({ errMsg: 'navigateTo:redirected' } as WechatMiniprogram.NavigateToSuccessCallbackResult);
                },
                fail: () => {
                  resolve({ errMsg: 'navigateTo:redirected' } as WechatMiniprogram.NavigateToSuccessCallbackResult);
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalNavigateTo(options);
        }
      }
    });
    
    // 重写wx.redirectTo方法
    const originalRedirectTo = wx.redirectTo;
    Object.defineProperty(wx, 'redirectTo', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: <T extends WechatMiniprogram.RedirectToOption>(options: T) => {
        const { url } = options;
        const path = this.getPathFromUrl(url);
        
        if (this.needLogin(path) && !isLoggedIn()) {
          // 保存原始要跳转的路径，登录后可以返回
          wx.setStorageSync('redirectUrl', url);
          
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          
          // 跳转到登录页
          return new Promise<WechatMiniprogram.RedirectToSuccessCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (res) => {
                  resolve({ errMsg: 'redirectTo:redirected' } as WechatMiniprogram.RedirectToSuccessCallbackResult);
                },
                fail: () => {
                  resolve({ errMsg: 'redirectTo:redirected' } as WechatMiniprogram.RedirectToSuccessCallbackResult);
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalRedirectTo(options);
        }
      }
    });
    
    // 重写wx.switchTab方法
    const originalSwitchTab = wx.switchTab;
    Object.defineProperty(wx, 'switchTab', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: <T extends WechatMiniprogram.SwitchTabOption>(options: T) => {
        const { url } = options;
        const path = this.getPathFromUrl(url);
        
        if (this.needLogin(path) && !isLoggedIn()) {
          // 由于switchTab不能带参数，无法保存原始跳转路径
          
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          
          // 跳转到登录页
          return new Promise<WechatMiniprogram.SwitchTabSuccessCallbackResult>((resolve) => {
            setTimeout(() => {
              originalSwitchTab({
                url: '/pages/profile/profile',
                success: (res) => {
                  resolve({ errMsg: 'switchTab:redirected' } as WechatMiniprogram.SwitchTabSuccessCallbackResult);
                },
                fail: () => {
                  resolve({ errMsg: 'switchTab:redirected' } as WechatMiniprogram.SwitchTabSuccessCallbackResult);
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalSwitchTab(options);
        }
      }
    });
    
    // 重写wx.reLaunch方法
    const originalReLaunch = wx.reLaunch;
    Object.defineProperty(wx, 'reLaunch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: <T extends WechatMiniprogram.ReLaunchOption>(options: T) => {
        const { url } = options;
        const path = this.getPathFromUrl(url);
        
        if (this.needLogin(path) && !isLoggedIn()) {
          // 保存原始要跳转的路径，登录后可以返回
          wx.setStorageSync('redirectUrl', url);
          
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          
          // 跳转到登录页
          return new Promise<WechatMiniprogram.ReLaunchSuccessCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (res) => {
                  resolve({ errMsg: 'reLaunch:redirected' } as WechatMiniprogram.ReLaunchSuccessCallbackResult);
                },
                fail: () => {
                  resolve({ errMsg: 'reLaunch:redirected' } as WechatMiniprogram.ReLaunchSuccessCallbackResult);
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalReLaunch(options);
        }
      }
    });
  },
  
  // 从URL中提取页面路径
  getPathFromUrl(url: string): string {
    if (!url) return '';
    
    // 移除参数部分
    let path = url.split('?')[0];
    // 移除开头的斜杠
    if (path.startsWith('/')) {
      path = path.substring(1);
    }
    return path;
  },
  
  // 判断页面是否需要登录
  needLogin(pagePath: string): boolean {
    return this.globalData.needLoginPages.some(page => pagePath === page);
  }
});