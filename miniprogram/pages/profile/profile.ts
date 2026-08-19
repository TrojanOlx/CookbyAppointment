// 我的页面
import { UserService } from '../../services/userService';
import { User } from '../../models/user';
import { showToast, showLoading, hideLoading } from '../../utils/util';
import { FileService } from '../../services/fileService';
import { ImageCacheService } from '../../utils/imageCache';
import { getAuthSessionGeneration, invalidateAuthSession } from '../../utils/auth';
const { FamilyService } = require('../../services/family');
const { canManageFamily } = require('../../services/familyRole');
let userInfoRequestId = 0;
let familyContextRequestId = 0;
let profileSessionGeneration = 0;
let profileViewGeneration = 0;

// 页面数据接口
interface IPageData {
  userInfo: User | null;
  isAdmin: boolean;
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
}

// 页面方法接口
interface IPageMethods {
  checkAdminStatus: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
  doLogin: () => Promise<void>;
  doLogout: () => void;
  getPhoneNumber: (e: WechatMiniprogram.ButtonGetPhoneNumber) => void;
  fetchUserInfo: () => Promise<void>;
  isUserInfoComplete: () => boolean;
  checkAndRedirect: (redirectUrl: string) => void;
  saveNickName: (nickName: string) => void;
  saveAvatar: (filePath: string) => Promise<void>;
  clearCache: () => void;
  syncFamilyContext: () => Promise<void>;
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
    canManageFamily: false
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
        this.checkAdminStatus();
      }
      // 缓存只用于首屏展示，随后以服务端资料为准并刷新短期头像地址。
      void this.fetchUserInfo();
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
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar) {
        tabBar.setData({
          selected: 3
        });
      }
    }
    void this.syncFamilyContext().then(() => {
      if (
        viewGeneration !== profileViewGeneration
        || authGeneration !== getAuthSessionGeneration()
        || token !== String(wx.getStorageSync('token') || '')
      ) return;
      // 头像文件存储在家庭空间；零家庭状态下先完成创建或加入，再提示上传。
      if (this.data.userInfo && !this.data.userInfo.avatarUrl && this.data.hasFamily) {
        const familyId = String(FamilyService.getActiveFamilyId() || '');
        wx.showToast({ title: '请上传头像', icon: 'none' });
        setTimeout(() => {
          if (
            viewGeneration !== profileViewGeneration
            || authGeneration !== getAuthSessionGeneration()
            || token !== String(wx.getStorageSync('token') || '')
            || familyId !== String(FamilyService.getActiveFamilyId() || '')
          ) return;
          this.onChooseAvatar({});
        }, 500);
      }
    });
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
  async fetchUserInfo() {
    const requestId = ++userInfoRequestId;
    const token = String(wx.getStorageSync('token') || '');
    if (!token) return;
    try {
      showLoading('获取用户信息...');
      // 不传入userId参数，使用当前登录用户身份获取信息
      const userInfo = await UserService.getUserInfo();
      if (requestId !== userInfoRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      if (userInfo) {
        wx.setStorageSync('userInfo', userInfo);
        this.setData({
          userInfo,
          hasUserInfo: true,
          openid: userInfo.openid
        });
        this.checkAdminStatus();
      }
    } catch (error) {
      if (requestId !== userInfoRequestId || String(wx.getStorageSync('token') || '') !== token) return;
      console.error('获取用户信息失败:', error);
      // http.ts 已对 401/403 显示弹窗并清除 token，此处不重复清除
      // 避免与 doLogin() 竞态——如果刚保存了新 token，不能在这里删掉它
      this.setData({
        userInfo: null,
        hasUserInfo: false,
        isAdmin: false,
        openid: null
      });
    } finally {
      if (requestId === userInfoRequestId && String(wx.getStorageSync('token') || '') === token) hideLoading();
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
                setTimeout(() => tryLogin(false), 800);
              } else {
                reject(new Error('wx.login 失败: ' + res.errMsg));
              }
            },
            fail: (err) => {
              if (retry) {
                setTimeout(() => tryLogin(false), 800);
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
      wx.setStorageSync('token', loginResult.token);
      wx.setStorageSync('openid', loginResult.openid);

      this.setData({
        openid: loginResult.openid,
        isLoggingIn: false
      });

      showToast('登录成功');

      // 获取用户信息
      await this.fetchUserInfo();

      // 登录后立即同步家庭上下文，使零家庭入口无需重新进入“我的”页才出现。
      await this.syncFamilyContext();

      // 获取重定向URL（如果有）
      const redirectUrl = wx.getStorageSync('redirectUrl');

      if (!this.isUserInfoComplete()) {
        showToast('请完善头像和昵称');
      }
      this.checkAndRedirect(redirectUrl);
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
          url: redirectUrl
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

    // 检查必要的个人信息字段是否存在
    const hasBasicInfo = Boolean(
      userInfo.nickName &&
      userInfo.avatarUrl
    );

    return hasBasicInfo;
  },

  // 退出登录
  doLogout() {
    userInfoRequestId += 1;
    familyContextRequestId += 1;
    profileSessionGeneration += 1;
    invalidateAuthSession();
    hideLoading();
    if (wx.getStorageSync('token')) {
      void UserService.logout().catch(error => console.warn('服务端注销失败:', error));
    }
    [
      'token', 'user_token', 'session_key', 'openid', 'userInfo', 'phoneNumber',
      'active_family_id', 'active_family', 'active_family_role', 'family_role',
      'redirectUrl', 'notifyAppointment', 'notifyReview',
      'dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'
    ].forEach(key => wx.removeStorageSync(key));
    void ImageCacheService.clear().catch(error => console.warn('退出后图片缓存清理失败:', error));

    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false,
      openid: null,
      currentFamilyName: '',
      currentFamilyRole: '',
      hasFamily: false,
      familyLoading: false,
      canManageFamily: false,
      editingNickName: false,
      editingNickNameValue: '',
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
    const fileInfo = await FileService.uploadSingleImage('avatars');
    if (generation !== profileSessionGeneration) return;
    if (fileInfo && fileInfo.filePath) {
      try {
        await (this as any).saveAvatar(fileInfo.filePath);
      } catch {
        showToast('头像上传失败');
      }
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
    if (normalizedNickName === '微信用户') {
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
    this.setData({ editingNickNameValue: nickName });
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
          profileSessionGeneration += 1;
          invalidateAuthSession();
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
              setTimeout(() => {
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
  }
});
