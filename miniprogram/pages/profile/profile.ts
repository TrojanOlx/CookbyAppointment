// 我的页面
import { UserService } from '../../services/userService';
import { User } from '../../models/user';
import { showToast, showLoading, hideLoading } from '../../utils/util';
import { ImageCacheService } from '../../utils/imageCache';
import { getAuthSessionGeneration, invalidateAuthSession } from '../../utils/auth';
import { PlatformAdminService } from '../../services/platformAdminService';
import { clearSessionCache } from '../../services/http';
import { createAppShareContent } from '../../utils/share';
const { FamilyService } = require('../../services/family');
const { canManageFamily } = require('../../services/familyRole');
let userInfoRequestId = 0;
let familyContextRequestId = 0;
let platformStatusRequestId = 0;
let profileSessionGeneration = 0;
let profileViewGeneration = 0;

type ProfileTimer = ReturnType<typeof setTimeout>;

const scheduleProfileTimer = (page: any, callback: () => void, delay: number): ProfileTimer => {
  const timers: Set<ProfileTimer> = page.profileTimers || (page.profileTimers = new Set<ProfileTimer>());
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
  return timer;
};

const clearProfileTimers = (page: any): void => {
  const timers: Set<ProfileTimer> | undefined = page.profileTimers;
  if (!timers) return;
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
};

// 页面数据接口
interface IPageData {
  userInfo: User | null;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  hasUserInfo: boolean;
  openid: string | null;
  isLoggingIn: boolean;
  editingNickName?: boolean;
  editingNickNameValue: string;
  nickNameSavePending: boolean;
  version: string;
  currentFamilyName: string;
  currentFamilyRole: string;
  hasFamily: boolean;
  familySelectionRequired: boolean;
  familyLoading: boolean;
  canManageFamily: boolean;
  scrollIntoView: string;
}

// 页面方法接口
interface IPageMethods {
  checkAdminStatus: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
  doLogin: () => Promise<void>;
  doLogout: () => void;
  getPhoneNumber: (e: WechatMiniprogram.ButtonGetPhoneNumber) => void;
  fetchUserInfo: (promptSource?: 'login' | 'cold-start' | 'none') => Promise<void>;
  promptProfileCompletion: (userInfo: User, source: 'login' | 'cold-start') => void;
  isUserInfoComplete: () => boolean;
  checkAndRedirect: (redirectUrl: string) => void;
  saveNickName: (nickName: string) => void;
  saveAvatar: (filePath: string) => Promise<void>;
  clearCache: () => void;
  syncFamilyContext: () => Promise<void>;
  syncPlatformAdminStatus: () => Promise<void>;
  openCreateFamily: () => void;
  openJoinFamily: () => void;
}

Page<IPageData, IPageMethods & {
  onChooseAvatar: (e?: any) => void;
  onNickNameEdit: () => void;
  onNickNameInput: (e: any) => void;
  onNickNameConfirm: (e: any) => void;
  saveAvatar: (filePath: string) => Promise<void>;
}>({
  data: {
    userInfo: null,
    isAdmin: false,
    isPlatformAdmin: false,
    hasUserInfo: false,
    openid: null,
    isLoggingIn: false,
    editingNickName: false,
    editingNickNameValue: '',
    nickNameSavePending: false,
    version: '',
    currentFamilyName: '',
    currentFamilyRole: '',
    hasFamily: false,
    familySelectionRequired: false,
    familyLoading: false,
    canManageFamily: false,
    scrollIntoView: ''
  },

  onLoad() {
    // 读取小程序版本号（体验版/正式版有值，开发版为空）
    try {
      const accountInfo = wx.getAccountInfoSync();
      const ver = accountInfo.miniProgram.version;
      this.setData({ version: ver || '开发版' });
    } catch (e) {
      this.setData({ version: '开发版' });
    }

    // 检查是否已登录
    const token = wx.getStorageSync('token');
    if (token) {
      // 尝试从本地存储获取用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.setData({
          userInfo,
          hasUserInfo: true,
          openid: userInfo.openid
        });
        this.promptProfileCompletion(userInfo, 'cold-start');
      }
      // 缓存只用于首屏展示，随后以服务端资料为准并刷新短期头像地址。
      void this.fetchUserInfo('cold-start');
    }

    // 监听初始化事件
    const app = getApp<{
      globalData: {
        eventBus: {
          on: (event: string, callback: (...args: any[]) => void) => void;
        };
      };
    }>();

    const initLoginPageHandler = () => {
      console.log('收到登录页面初始化事件');
      // 清除登录状态
      this.setData({
        userInfo: null,
        hasUserInfo: false,
        isAdmin: false,
        isPlatformAdmin: false,
        openid: null,
        isLoggingIn: false,
        currentFamilyName: '',
        currentFamilyRole: '',
        hasFamily: false,
        familySelectionRequired: false,
        familyLoading: false,
        canManageFamily: false
      });
      // 清除本地存储的登录信息
      this.doLogout();
    };
    (this as any)._initLoginPageHandler = initLoginPageHandler;
    app.globalData.eventBus.on('initLoginPage', initLoginPageHandler);
  },

  onUnload() {
    profileViewGeneration += 1;
    profileSessionGeneration += 1;
    clearProfileTimers(this);
    const handler = (this as any)._initLoginPageHandler;
    if (handler) {
      const app = getApp<{ globalData: { eventBus: { off: (event: string, cb: (...args: any[]) => void) => void } } }>();
      app.globalData.eventBus.off('initLoginPage', handler);
    }
  },

  onHide() {
    profileViewGeneration += 1;
  },

  onShow() {
    const viewGeneration = ++profileViewGeneration;
    const authGeneration = getAuthSessionGeneration();
    const token = String(wx.getStorageSync('token') || '');
    if (wx.getStorageSync('profile_focus')) {
      wx.removeStorageSync('profile_focus');
      this.setData({ scrollIntoView: 'profile-info' });
      scheduleProfileTimer(this, () => this.setData({ scrollIntoView: '' }), 700);
    }
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar) {
        tabBar.setData({
          selected: 3
        });
      }
    }
    if (token && (this as any).userInfoRequestToken !== token) {
      // Calling on every tab visit lets the five-minute HTTP TTL decide whether
      // a network request is needed, while an in-progress reconciliation is
      // still shared by onLoad/onShow.
      void this.fetchUserInfo('none');
    }
    void this.syncFamilyContext().then(() => {
      if (
        viewGeneration !== profileViewGeneration
        || authGeneration !== getAuthSessionGeneration()
        || token !== String(wx.getStorageSync('token') || '')
      ) return;
    });
    void this.syncPlatformAdminStatus();
  },

  async syncPlatformAdminStatus() {
    const requestId = ++platformStatusRequestId;
    const token = String(wx.getStorageSync('token') || '');
    if (!token) {
      this.setData({ isPlatformAdmin: false });
      return;
    }
    try {
      const status = await PlatformAdminService.getStatus();
      if (requestId !== platformStatusRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      this.setData({ isPlatformAdmin: status.isPlatformAdmin });
    } catch (error) {
      if (requestId !== platformStatusRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      console.warn('同步平台管理员状态失败:', error);
      this.setData({ isPlatformAdmin: false });
    }
  },

  async syncFamilyContext() {
    const requestId = ++familyContextRequestId;
    const token = String(wx.getStorageSync('token') || '');
    if (!token) {
      this.setData({
        isAdmin: false,
        currentFamilyName: '',
        currentFamilyRole: '',
        hasFamily: false,
        familySelectionRequired: false,
        canManageFamily: false
      });
      return;
    }
    this.setData({ familyLoading: true });
    try {
      const families = await FamilyService.list();
      if (requestId !== familyContextRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      let activeId = FamilyService.getActiveFamilyId();
      let active = families.find((family: any) => family.id === activeId);
      if (!active && families.length === 1) {
        active = families[0];
        activeId = FamilyService.setActiveFamilyId(active.id);
      }
      if (!active && activeId) FamilyService.clearActiveFamilyId();
      const role = active ? active.role : '';
      const familySelectionRequired = !active && families.length > 1;
      this.setData({
        isAdmin: role === 'owner' || role === 'admin',
        currentFamilyName: active ? active.name : '',
        currentFamilyRole: role,
        hasFamily: !!active,
        familySelectionRequired,
        canManageFamily: canManageFamily(role)
      });
    } catch (error) {
      if (requestId !== familyContextRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      console.warn('同步家庭上下文失败:', error);
    } finally {
      if (requestId === familyContextRequestId && String(wx.getStorageSync('token') || '') === token) {
        this.setData({ familyLoading: false });
      }
    }
  },

  // 获取用户信息
  async fetchUserInfo(promptSource: 'login' | 'cold-start' | 'none' = 'none') {
    const requestId = ++userInfoRequestId;
    const token = String(wx.getStorageSync('token') || '');
    if (!token) return;
    (this as any).userInfoRequestToken = token;
    try {
      // 不传入userId参数，使用当前登录用户身份获取信息
      const userInfo = await UserService.getUserInfo();
      if (requestId !== userInfoRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      if (userInfo) {
        (this as any).userInfoSyncToken = token;
        wx.setStorageSync('userInfo', userInfo);
        this.setData({
          userInfo,
          hasUserInfo: true,
          openid: userInfo.openid
        });
        if (promptSource !== 'none') this.promptProfileCompletion(userInfo, promptSource);
        this.checkAdminStatus();
      }
    } catch (error) {
      if (requestId !== userInfoRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      console.error('获取用户信息失败:', error);
      // http.ts 已对 401/403 显示弹窗并清除 token，此处不重复清除
      // Keep the local account summary visible when background reconciliation
      // fails; a later dirty/TTL refresh can retry without a blank profile.
    } finally {
      if ((this as any).userInfoRequestToken === token) {
        (this as any).userInfoRequestToken = '';
      }
    }
  },

  // 执行登录
  async doLogin() {
    if (this.data.isLoggingIn) return;
    const loginGeneration = ++profileSessionGeneration;
    const authGeneration = getAuthSessionGeneration();
    try {
      this.setData({ isLoggingIn: true });

      // 获取登录code（冷启动 / 版本升级后首次调用可能失败，最多重试一次）
      const loginCode = await new Promise<string>((resolve, reject) => {
        const tryLogin = (retry: boolean) => {
          wx.login({
            success: (res) => {
              if (res.code) {
                resolve(res.code);
              } else if (retry) {
                scheduleProfileTimer(this, () => tryLogin(false), 800);
              } else {
                reject(new Error('wx.login 失败: ' + res.errMsg));
              }
            },
            fail: (err) => {
              if (retry) {
                scheduleProfileTimer(this, () => tryLogin(false), 800);
              } else {
                reject(err);
              }
            }
          });
        };
        tryLogin(true);
      });

      // 调用UserService进行登录
      const loginResult = await UserService.login(loginCode);
      if (
        loginGeneration !== profileSessionGeneration
        || authGeneration !== getAuthSessionGeneration()
      ) return;

      // 确保获取到token
      if (!loginResult.token) {
        throw new Error('登录返回数据不完整，缺少token');
      }

      // 保存登录状态
      clearSessionCache();
      wx.setStorageSync('token', loginResult.token);
      wx.setStorageSync('openid', loginResult.openid);

      this.setData({
        openid: loginResult.openid,
        isLoggingIn: false
      });

      showToast('登录成功');

      // 获取用户信息
      await this.fetchUserInfo('none');

      // 登录后立即同步家庭上下文，使零家庭入口无需重新进入“我的”页才出现。
      await this.syncFamilyContext();
      await this.syncPlatformAdminStatus();

      // 获取重定向URL（如果有）
      const redirectUrl = wx.getStorageSync('redirectUrl');

      this.checkAndRedirect(redirectUrl);
      const loggedInUser = this.data.userInfo;
      const loginProfileSnapshot = loginResult.profileComplete === false
        ? ({
            ...(loginResult.user || {}),
            openid: loginResult.openid,
            nickName: loginResult.user?.nickName || '',
            avatarUrl: loginResult.user?.avatarUrl || '',
            profileComplete: loginResult.profileComplete,
            missingProfileFields: loginResult.missingProfileFields
          } as User)
        : null;
      const profileSnapshot = loggedInUser || loginProfileSnapshot;
      if (profileSnapshot) {
        scheduleProfileTimer(this, () => {
          if (
            loginGeneration !== profileSessionGeneration
            || authGeneration !== getAuthSessionGeneration()
            || String(wx.getStorageSync('token') || '') !== String(loginResult.token)
          ) return;
          this.promptProfileCompletion(profileSnapshot, 'login');
        }, 350);
      }
    } catch (error) {
      if (
        loginGeneration !== profileSessionGeneration
        || authGeneration !== getAuthSessionGeneration()
      ) return;
      console.error('登录失败:', error);
      this.setData({ isLoggingIn: false });
      showToast('登录失败，请重试');
    }
  },

  // 检查并执行重定向
  checkAndRedirect(redirectUrl: string) {
    const normalizedRedirect = redirectUrl
      ? (redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`).split('?')[0]
      : '';
    if (redirectUrl && normalizedRedirect !== '/pages/profile/profile') {
      // 清除存储的重定向URL
      wx.removeStorageSync('redirectUrl');

      // 检查URL是否包含switchTab的页面
      const tabPages = [
        '/pages/index/index',
        '/pages/menu/menu',
        '/pages/appointment/appointment',
        '/pages/profile/profile'
      ];

      // 检查是否是tabBar页面
      const isTabPage = tabPages.some(tabPage => redirectUrl.startsWith(tabPage));

      if (isTabPage) {
        wx.switchTab({
          url: normalizedRedirect
        });
      } else {
        wx.navigateTo({
          url: redirectUrl
        });
      }
    } else if (redirectUrl) {
      // 登录页本身不需要再次跳转，避免登录后在 profile 与 profile 之间循环。
      wx.removeStorageSync('redirectUrl');
    }
  },

  // 判断用户信息是否完整
  isUserInfoComplete() {
    const { userInfo } = this.data;
    if (!userInfo) return false;

    const nickName = typeof userInfo.nickName === 'string' ? userInfo.nickName.trim() : '';
    const avatarUrl = typeof userInfo.avatarUrl === 'string' ? userInfo.avatarUrl.trim() : '';
    return Boolean(
      nickName &&
      !['微信用户', '微信昵称', '用户'].includes(nickName) &&
      avatarUrl &&
      !avatarUrl.startsWith('/images/') &&
      userInfo.profileComplete !== false
    );
  },

  promptProfileCompletion(userInfo: User, source: 'login' | 'cold-start') {
    const app = getApp<any>();
    if (app && typeof app.promptProfileCompletion === 'function') {
      app.promptProfileCompletion(userInfo, source);
    }
  },

  // 退出登录
  doLogout() {
    userInfoRequestId += 1;
    familyContextRequestId += 1;
    platformStatusRequestId += 1;
    profileSessionGeneration += 1;
    invalidateAuthSession();
    clearSessionCache();
    hideLoading();
    if (wx.getStorageSync('token')) {
      void UserService.logout().catch(error => console.warn('服务端注销失败:', error));
    }
    [
      'token', 'user_token', 'session_key', 'openid', 'userInfo', 'phoneNumber',
      'active_family_id', 'active_family', 'active_family_role', 'family_role',
      'redirectUrl', 'profile_focus', 'notifyAppointment', 'notifyReview',
      'dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'
    ].forEach(key => wx.removeStorageSync(key));
    void ImageCacheService.clear().catch(error => console.warn('退出后图片缓存清理失败:', error));

    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false,
      isPlatformAdmin: false,
      openid: null,
      currentFamilyName: '',
      currentFamilyRole: '',
      hasFamily: false,
      familyLoading: false,
      canManageFamily: false,
      editingNickName: false,
      editingNickNameValue: '',
      scrollIntoView: '',
      nickNameSavePending: false
    });

    showToast('已退出登录');
  },

  // 获取手机号码（需要在wxml的button组件上设置open-type="getPhoneNumber"）
  getPhoneNumber(e: WechatMiniprogram.ButtonGetPhoneNumber) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // 用户同意授权，获取code
      const code = e.detail.code;
      console.log('获取手机号成功, code:', code);

      // 调用UserService获取手机号
      const generation = profileSessionGeneration;
      showLoading('获取手机号中...');
      UserService.getPhoneNumber(code)
        .then(async result => {
          if (generation !== profileSessionGeneration) return;
          console.log('手机号信息:', result);
          const updatedUser = await UserService.getUserInfo();
          if (generation !== profileSessionGeneration) return;
          wx.setStorageSync('userInfo', updatedUser);
          this.setData({
            userInfo: updatedUser
          });

          hideLoading();
          showToast('手机号绑定成功');
        })
        .catch(err => {
          if (generation !== profileSessionGeneration) return;
          console.error('手机号获取失败:', err);
          hideLoading();
          showToast('手机号获取失败');
        });
    } else {
      console.error('获取手机号失败:', e.detail.errMsg);
      showToast('获取手机号失败');
    }
  },

  // 检查管理员状态
  async checkAdminStatus() {
    const generation = profileSessionGeneration;
    try {
      const result = await UserService.checkAdmin();
      if (generation !== profileSessionGeneration) return;
      this.setData({ isAdmin: result.isAdmin });
    } catch (error) {
      if (generation !== profileSessionGeneration) return;
      console.error('检查管理员状态失败:', error);

      this.setData({ isAdmin: false });
    }
  },

  // 页面导航
  navigateTo(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url;
    const tabPages = [
      '/pages/index/index',
      '/pages/menu/menu',
      '/pages/appointment/appointment',
      '/pages/profile/profile'
    ];
    const isTabPage = tabPages.includes(url);
    if (isTabPage) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  openCreateFamily() {
    wx.navigateTo({ url: '/pages/family/create/create' });
  },

  openJoinFamily() {
    wx.navigateTo({ url: '/pages/family/join/join' });
  },

  /**
   * 选择头像，支持微信chooseAvatar和自定义上传
   */
  async onChooseAvatar(e?: any) {
    const generation = profileSessionGeneration;
    if (e && e.detail && e.detail.avatarUrl) {
      const localPath = e.detail.avatarUrl;
      // 如果是本地临时文件，直接用 updateAvatar 上传
      if (localPath.startsWith('http://tmp/') || localPath.startsWith('wxfile://')) {
        try {
          const uploadRes = await UserService.updateAvatar(localPath);
          if (generation !== profileSessionGeneration) return;
          if (uploadRes && uploadRes.filePath) {
            await (this as any).saveAvatar(uploadRes.filePath);
          } else {
            showToast('头像上传失败');
          }
        } catch {
          showToast('头像上传失败');
        }
        return;
      }
      // 否则直接保存（如公网 http(s) 链接）
      await (this as any).saveAvatar(localPath);
      if (generation !== profileSessionGeneration) return;
      // 新增：同步判断 hasUserInfo
      const nickName = this.data.userInfo?.nickName;
      this.setData({
        hasUserInfo: !!(nickName && localPath)
      });
      return;
    }
    // 兜底：手动选择
    const localPath = await new Promise<string>((resolve) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: result => resolve(result.tempFiles[0]?.tempFilePath || ''),
        fail: () => resolve('')
      });
    });
    if (!localPath || generation !== profileSessionGeneration) return;
    try {
      const uploadRes = await UserService.updateAvatar(localPath);
      if (generation !== profileSessionGeneration) return;
      await (this as any).saveAvatar(uploadRes.filePath);
    } catch {
      showToast('头像上传失败');
    }
    // 新增：同步判断 hasUserInfo
    const nickName = this.data.userInfo?.nickName;
    const avatarUrl = this.data.userInfo?.avatarUrl;
    this.setData({
      hasUserInfo: !!(nickName && avatarUrl)
    });
  },

  /**
   * 保存头像到用户信息
   */
  async saveAvatar(filePath: string) {
    const generation = profileSessionGeneration;
    showLoading('更新头像...');
    try {
      const updatedUser = await UserService.updateUserInfo({ avatarUrl: filePath });
      if (generation !== profileSessionGeneration) return;
      wx.setStorageSync('userInfo', updatedUser);
      this.setData({
        userInfo: updatedUser,
        hasUserInfo: Boolean(updatedUser.nickName && updatedUser.avatarUrl)
      });
      hideLoading();
      showToast('头像已更新');
    } catch {
      if (generation !== profileSessionGeneration) return;
      hideLoading();
      showToast('头像更新失败');
    }
  },

  /**
   * 点击昵称，直接进入编辑状态
   */
  onNickNameEdit() {
    this.setData({
      editingNickName: true,
      editingNickNameValue: this.data.userInfo?.nickName || ''
    });
  },

  /**
   * 保存昵称到后端
   */
  saveNickName(nickName: string) {
    const normalizedNickName = nickName.trim();
    if (!normalizedNickName) {
      this.setData({
        editingNickName: false,
        editingNickNameValue: this.data.userInfo?.nickName || ''
      });
      return;
    }
    if (Array.from(normalizedNickName).length > 20 || /[\u0000-\u001F\u007F]/.test(normalizedNickName)) {
      showToast('昵称最多20个字，不能包含控制字符');
      return;
    }
    if (['微信用户', '微信昵称', '用户'].includes(normalizedNickName)) {
      showToast('请手动输入昵称');
      return;
    }
    if (this.data.nickNameSavePending) return;
    if (normalizedNickName === this.data.userInfo?.nickName) {
      this.setData({
        editingNickName: false,
        editingNickNameValue: normalizedNickName
      });
      return;
    }
    this.setData({ nickNameSavePending: true });
    const generation = profileSessionGeneration;
    showLoading('更新昵称...');
    UserService.updateUserInfo({ nickName: normalizedNickName })
      .then(updatedUser => {
        if (generation !== profileSessionGeneration) return;
        wx.setStorageSync('userInfo', updatedUser);
        this.setData({
          userInfo: updatedUser,
          editingNickName: false,
          editingNickNameValue: updatedUser.nickName,
          nickNameSavePending: false,
          hasUserInfo: Boolean(updatedUser.nickName && updatedUser.avatarUrl)
        });
        hideLoading();
        showToast('昵称已更新');
      })
      .catch(() => {
        if (generation !== profileSessionGeneration) return;
        hideLoading();
        showToast('昵称更新失败');
        this.setData({
          editingNickName: false,
          editingNickNameValue: this.data.userInfo?.nickName || '',
          nickNameSavePending: false
        });
      });
  },

  /**
   * 昵称输入完成（失焦或回车）
   */
  onNickNameConfirm(e) {
    const nickName = typeof e.detail?.value === 'string'
      ? e.detail.value
      : this.data.editingNickNameValue;
    if (!nickName) {
      this.setData({
        editingNickName: false,
        editingNickNameValue: this.data.userInfo?.nickName || ''
      });
      return;
    }
    (this as any).saveNickName(nickName);
  },

  /**
   * 输入昵称
   */
  onNickNameInput(e) {
    const nickName = e.detail.value;
    const value = typeof nickName === 'string' ? nickName : '';
    this.setData({ editingNickNameValue: value });
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？清除后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          if (wx.getStorageSync('token')) {
            void UserService.logout().catch(error => console.warn('服务端注销失败:', error));
          }
          userInfoRequestId += 1;
          familyContextRequestId += 1;
          platformStatusRequestId += 1;
          profileSessionGeneration += 1;
          invalidateAuthSession();
          clearSessionCache();
          hideLoading();
          // Start cleanup before clearing storage so persisted image entries
          // are still available for deleting saved files.
          const clearImageCache = ImageCacheService.clear()
            .catch(error => console.warn('图片缓存清理失败:', error));
          // Invalidate the session before waiting for file cleanup so a
          // pending login cannot repopulate storage that is about to clear.
          wx.clearStorageSync();

          const finishClear = () => {
            try {
              // 重置页面数据
              this.setData({
                userInfo: null,
                isAdmin: false,
                isPlatformAdmin: false,
                hasUserInfo: false,
                openid: null,
                isLoggingIn: false,
                editingNickName: false,
                editingNickNameValue: '',
                nickNameSavePending: false
              });

              // 显示成功提示
              wx.showToast({
                title: '缓存已清除',
                icon: 'success',
                duration: 2000
              });

              // 2秒后重启小程序
              scheduleProfileTimer(this, () => {
                wx.reLaunch({
                  url: '/pages/index/index'
                });
              }, 2000);
            } catch (e) {
              console.error('清除缓存失败:', e);
              wx.showToast({
                title: '清除缓存失败',
                icon: 'error',
                duration: 2000
              });
            }
          };

          clearImageCache.then(finishClear, finishClear);
        }
      }
    });
  },

  onShareAppMessage() {
    return createAppShareContent();
  }
});
