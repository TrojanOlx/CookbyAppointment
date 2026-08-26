// app.ts
import { hasUserAcceptedPrivacy } from './utils/privacy';
import { isLoggedIn } from './utils/auth';
import { eventBus } from './utils/eventBus';
import { BASE_URL } from './services/http';
import { UserService } from './services/userService';

const CURRENT_MINIPROGRAM_VERSION = '1.0.3';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000;

type ProfileField = 'nickName' | 'avatarUrl';

const PROFILE_PLACEHOLDER_NAMES = ['微信用户', '微信昵称', '用户'];

const getProfileCompletion = (userInfo: any): {
  profileComplete: boolean;
  missingProfileFields: ProfileField[];
} => {
  const nickName = typeof userInfo?.nickName === 'string' ? userInfo.nickName.trim() : '';
  const avatarUrl = typeof userInfo?.avatarUrl === 'string' ? userInfo.avatarUrl.trim() : '';
  const missingProfileFields: ProfileField[] = [];
  if (!nickName || PROFILE_PLACEHOLDER_NAMES.includes(nickName)) missingProfileFields.push('nickName');
  if (!avatarUrl || avatarUrl.startsWith('/images/')) missingProfileFields.push('avatarUrl');
  return {
    profileComplete: missingProfileFields.length === 0 && userInfo?.profileComplete !== false,
    missingProfileFields
  };
};

const getRuntimeMiniProgramVersion = (): string => {
  try {
    return String(wx.getAccountInfoSync().miniProgram.version || CURRENT_MINIPROGRAM_VERSION);
  } catch {
    return CURRENT_MINIPROGRAM_VERSION;
  }
};

// 需要登录才能访问的页面路径（必须与 app.json 中注册的页面路径一致）
const needLoginPages = [
  "pages/menu/add/add",
  "pages/menu/detail/detail",
  "pages/menu/templates/templates",
  "pages/appointment/appointment",
  "pages/appointment/select/select",
  "pages/appointment/booking/booking",
  "pages/inventory/inventory",
  "pages/inventory/add/add",
  "pages/profile/settings/settings",
  "pages/profile/account/account",
  "pages/profile/preferences/preferences",
  "pages/family/index/index",
  "pages/family/create/create",
  "pages/family/join/join",
  "pages/family/invite/invite",
  "pages/family/members/members",
  "pages/menu/recommend/recommend",
  "pages/shopping/index",
  "pages/profile/admin/appointments/appointments",
  "pages/profile/admin/reviews/reviews",
  "pages/profile/admin/statistics/statistics",
  "pages/profile/admin/files/files",
  "pages/platform-admin/index/index",
  "pages/platform-admin/users/users",
  "pages/platform-admin/user-detail/user-detail",
  "pages/platform-admin/families/families",
  "pages/platform-admin/templates/templates",
  "pages/platform-admin/template-edit/template-edit",
  "pages/platform-admin/ingredients/ingredients",
  "pages/platform-admin/audit/audit",
  "pages/profile/reviews/reviews",
  "pages/review/review"
];

// 定义通用返回结果类型
interface GeneralCallbackResult {
  errMsg: string;
}

App({
  globalData: {
    systemInfo: null as WechatMiniprogram.SystemInfo | null,
    needLoginPages: needLoginPages,
    eventBus: eventBus,
    updateManagerInitialized: false,
    versionCheckAt: 0,
    promptedVersion: '',
    profilePromptedKeys: {} as Record<string, boolean>,
    profileColdStartCheckStarted: false
  },
  
  onLaunch() {
    this.checkForAppUpdate();

    // 获取系统信息
    wx.getSystemInfo({
      success: res => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      }
    });
    
    // 处理隐私授权
    if (!hasUserAcceptedPrivacy()) {
      // 如果用户未接受隐私政策，引导到隐私政策页面
      wx.navigateTo({
        url: '/pages/privacy/privacy'
      });
    }
    
    // 注册全局页面跳转拦截
    this.registerPageInterceptor();

    // 只在本次小程序运行的首次冷启动检查一次。服务端资料是权威来源，
    // 即使本地 userInfo 缺失或过期，也不能因此漏掉完善提醒。
    if (hasUserAcceptedPrivacy() && isLoggedIn()) {
      setTimeout(() => { void this.checkProfileCompletionOnColdStart(); }, 500);
    }
  },

  onShow() {
    this.checkForAppUpdate();
    this.checkRemoteAppVersion();
    if (hasUserAcceptedPrivacy() && isLoggedIn()) {
      void this.checkProfileCompletionOnColdStart();
    }
  },

  async checkProfileCompletionOnColdStart() {
    if (this.globalData.profileColdStartCheckStarted) return;
    this.globalData.profileColdStartCheckStarted = true;
    const token = String(wx.getStorageSync('token') || '');
    if (!token) return;
    try {
      const userInfo = await UserService.getUserInfo();
      if (String(wx.getStorageSync('token') || '') !== token) return;
      wx.setStorageSync('userInfo', userInfo);
      this.promptProfileCompletion(userInfo, 'cold-start');
    } catch (error) {
      if (String(wx.getStorageSync('token') || '') === token) {
        console.warn('冷启动校准用户资料失败:', error);
      }
    }
  },

  promptProfileCompletion(userInfo?: any, source: 'login' | 'cold-start' = 'cold-start') {
    const token = String(wx.getStorageSync('token') || '');
    if (!token) return;
    const snapshot = userInfo || wx.getStorageSync('userInfo');
    if (!snapshot || typeof snapshot !== 'object') return;
    const completion = getProfileCompletion(snapshot);
    if (completion.profileComplete) return;

    const promptKey = `${source}:${token}`;
    if (this.globalData.profilePromptedKeys[promptKey]) return;
    this.globalData.profilePromptedKeys[promptKey] = true;

    const labels = completion.missingProfileFields.map(field => field === 'avatarUrl' ? '头像' : '昵称');
    wx.showModal({
      title: '完善个人资料',
      content: `请设置${labels.join('和')}，方便家庭成员识别你。`,
      confirmText: '去完善',
      cancelText: '稍后',
      success: (res) => {
        if (!res.confirm) return;
        wx.setStorageSync('profile_focus', 'user-info');
        wx.switchTab({ url: '/pages/profile/profile' });
      },
      fail: () => {
        // 其他系统弹窗正在显示时重试，避免本次冷启动/登录被静默吞掉。
        delete this.globalData.profilePromptedKeys[promptKey];
      }
    });
  },

  // 检查正式版小程序更新
  checkForAppUpdate() {
    if (!wx.canIUse || !wx.canIUse('getUpdateManager')) {
      return;
    }
    if (this.globalData.updateManagerInitialized) {
      return;
    }
    this.globalData.updateManagerInitialized = true;

    const updateManager = wx.getUpdateManager();

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已准备好，是否重启更新？',
        confirmText: '重启更新',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });

    updateManager.onUpdateFailed(() => {
      wx.showModal({
        title: '更新失败',
        content: '新版本下载失败，请删除并重新打开小程序，或稍后再试。',
        showCancel: false,
        confirmText: '知道了'
      });
    });
  },

  // 服务端版本检查：用于旧包热启动时主动提醒用户刷新
  checkRemoteAppVersion() {
    const now = Date.now();
    if (now - this.globalData.versionCheckAt < VERSION_CHECK_INTERVAL) {
      return;
    }
    this.globalData.versionCheckAt = now;

    wx.request({
      url: `${BASE_URL}/api/app/version`,
      method: 'GET',
      success: (res: any) => {
        const latestVersion = res.data && res.data.version;
        const currentVersion = getRuntimeMiniProgramVersion();
        if (
          typeof latestVersion !== 'string' ||
          !this.isVersionNewer(latestVersion, currentVersion) ||
          this.globalData.promptedVersion === latestVersion
        ) {
          return;
        }

        this.globalData.promptedVersion = latestVersion;
        wx.showModal({
          title: '发现新版本',
          content: res.data.updateMessage || '小程序已有新版本，请重新打开后使用最新功能。',
          confirmText: '知道了',
          showCancel: false
        });
      },
      fail: (err) => {
        console.warn('检查小程序版本失败:', err);
      }
    });
  },

  isVersionNewer(latestVersion: string, currentVersion: string): boolean {
    const latestParts = latestVersion.split('.').map(part => parseInt(part, 10) || 0);
    const currentParts = currentVersion.split('.').map(part => parseInt(part, 10) || 0);
    const length = Math.max(latestParts.length, currentParts.length);

    for (let i = 0; i < length; i += 1) {
      const latest = latestParts[i] || 0;
      const current = currentParts[i] || 0;
      if (latest > current) return true;
      if (latest < current) return false;
    }

    return false;
  },
  
  // 注册页面跳转拦截器
  registerPageInterceptor() {
    const app = this; // 保存 App 实例，防止 this 指向错误
    // 重写wx.navigateTo方法
    const originalNavigateTo = wx.navigateTo;
    Object.defineProperty(wx, 'navigateTo', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function <T extends WechatMiniprogram.NavigateToOption>(options: T) {
        const { url } = options;
        const path = app.getPathFromUrl(url);
        if (app.needLogin(path) && !isLoggedIn()) {
          wx.setStorageSync('redirectUrl', url);
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          return new Promise<GeneralCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (_res) => {
                  resolve({ errMsg: 'navigateTo:redirected' });
                },
                fail: () => {
                  resolve({ errMsg: 'navigateTo:redirected' });
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalNavigateTo.call(wx, options);
        }
      }
    });
    // 重写wx.redirectTo方法
    const originalRedirectTo = wx.redirectTo;
    Object.defineProperty(wx, 'redirectTo', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function <T extends WechatMiniprogram.RedirectToOption>(options: T) {
        const { url } = options;
        const path = app.getPathFromUrl(url);
        if (app.needLogin(path) && !isLoggedIn()) {
          wx.setStorageSync('redirectUrl', url);
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          return new Promise<GeneralCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (_res) => {
                  resolve({ errMsg: 'redirectTo:redirected' });
                },
                fail: () => {
                  resolve({ errMsg: 'redirectTo:redirected' });
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalRedirectTo.call(wx, options);
        }
      }
    });
    // 重写wx.switchTab方法
    const originalSwitchTab = wx.switchTab;
    Object.defineProperty(wx, 'switchTab', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function <T extends WechatMiniprogram.SwitchTabOption>(options: T) {
        const { url } = options;
        const path = app.getPathFromUrl(url);
        if (app.needLogin(path) && !isLoggedIn()) {
          wx.setStorageSync('redirectUrl', url);
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          return new Promise<GeneralCallbackResult>((resolve) => {
            setTimeout(() => {
              originalSwitchTab({
                url: '/pages/profile/profile',
                success: (_res) => {
                  resolve({ errMsg: 'switchTab:redirected' });
                },
                fail: () => {
                  resolve({ errMsg: 'switchTab:redirected' });
                }
              });
            }, 1500);
          });
        } else {
          return originalSwitchTab.call(wx, options);
        }
      }
    });
    // 重写wx.reLaunch方法
    const originalReLaunch = wx.reLaunch;
    Object.defineProperty(wx, 'reLaunch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function <T extends WechatMiniprogram.ReLaunchOption>(options: T) {
        const { url } = options;
        const path = app.getPathFromUrl(url);
        if (app.needLogin(path) && !isLoggedIn()) {
          wx.setStorageSync('redirectUrl', url);
          wx.showToast({
            title: '请先登录',
            icon: 'none',
            duration: 1500
          });
          return new Promise<GeneralCallbackResult>((resolve) => {
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/profile/profile',
                success: (_res) => {
                  resolve({ errMsg: 'reLaunch:redirected' });
                },
                fail: () => {
                  resolve({ errMsg: 'reLaunch:redirected' });
                }
              });
            }, 1500);
          }) as any;
        } else {
          return originalReLaunch.call(wx, options);
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
