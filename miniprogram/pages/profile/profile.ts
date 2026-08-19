// 我的页面
import { UserService } from '../../services/userService';
import { User } from '../../models/user';
import { showToast, showLoading, hideLoading } from '../../utils/util';
import { FileService } from '../../services/fileService';
import { ImageCacheService } from '../../utils/imageCache';
const { FamilyService } = require('../../services/family');
const { canManageFamily } = require('../../services/familyRole');

// 页面数据接口
interface IPageData {
  userInfo: User | null;
  isAdmin: boolean;
  hasUserInfo: boolean;
  openid: string | null;
  isLoggingIn: boolean;
  editingNickName?: boolean;
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
  onInputChange: (e: any) => void;
}>({
  data: {
    userInfo: null,
    isAdmin: false,
    hasUserInfo: false,
    openid: null,
    isLoggingIn: false,
    editingNickName: false,
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
      } else {
        // 有token但没有用户信息，尝试获取用户信息
        this.fetchUserInfo();
      }
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
    const handler = (this as any)._initLoginPageHandler;
    if (handler) {
      const app = getApp<{ globalData: { eventBus: { off: (event: string, cb: (...args: any[]) => void) => void } } }>();
      app.globalData.eventBus.off('initLoginPage', handler);
    }
  },

  onShow() {
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
      // 头像文件存储在家庭空间；零家庭状态下先完成创建或加入，再提示上传。
      if (this.data.userInfo && !this.data.userInfo.avatarUrl && this.data.hasFamily) {
        wx.showToast({ title: '请上传头像', icon: 'none' });
        setTimeout(() => {
          this.onChooseAvatar({});
        }, 500);
      }
    });
  },

  async syncFamilyContext() {
    if (!wx.getStorageSync('token')) {
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
      console.warn('同步家庭上下文失败:', error);
    } finally {
      this.setData({ familyLoading: false });
    }
  },

  // 获取用户信息
  async fetchUserInfo() {
    try {
      showLoading('获取用户信息...');
      // 不传入userId参数，使用当前登录用户身份获取信息
      const userInfo = await UserService.getUserInfo();
      if (userInfo) {
        wx.setStorageSync('userInfo', userInfo);
        this.setData({
          userInfo,
          hasUserInfo: true,
          openid: userInfo.openid
        });
        this.checkAdminStatus();
      }
      hideLoading();
    } catch (error) {
      console.error('获取用户信息失败:', error);
      hideLoading();
      // http.ts 已对 401/403 显示弹窗并清除 token，此处不重复清除
      // 避免与 doLogin() 竞态——如果刚保存了新 token，不能在这里删掉它
      this.setData({
        userInfo: null,
        hasUserInfo: false,
        isAdmin: false,
        openid: null
      });
    }
  },

  // 执行登录
  async doLogin() {
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
    if (wx.getStorageSync('token')) {
      void UserService.logout().catch(error => console.warn('服务端注销失败:', error));
    }
    wx.removeStorageSync('token');
    wx.removeStorageSync('user_token');
    wx.removeStorageSync('session_key');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('active_family_id');
    wx.removeStorageSync('active_family');

    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false,
      openid: null,
      currentFamilyName: '',
      currentFamilyRole: '',
      hasFamily: false,
      familyLoading: false,
      canManageFamily: false
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
      showLoading('获取手机号中...');
      UserService.getPhoneNumber(code)
        .then(async result => {
          console.log('手机号信息:', result);
          const updatedUser = await UserService.getUserInfo();
          wx.setStorageSync('userInfo', updatedUser);
          this.setData({
            userInfo: updatedUser
          });

          hideLoading();
          showToast('手机号绑定成功');
        })
        .catch(err => {
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
    try {
      const result = await UserService.checkAdmin();
      this.setData({ isAdmin: result.isAdmin });
    } catch (error) {
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
    if (e && e.detail && e.detail.avatarUrl) {
      const localPath = e.detail.avatarUrl;
      // 如果是本地临时文件，直接用 updateAvatar 上传
      if (localPath.startsWith('http://tmp/') || localPath.startsWith('wxfile://')) {
        try {
          const uploadRes = await UserService.updateAvatar(localPath);
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
      // 新增：同步判断 hasUserInfo
      const nickName = this.data.userInfo?.nickName;
      this.setData({
        hasUserInfo: !!(nickName && localPath)
      });
      return;
    }
    // 兜底：手动选择
    const fileInfo = await FileService.uploadSingleImage('avatars');
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
    showLoading('更新头像...');
    try {
      const updatedUser = await UserService.updateUserInfo({ avatarUrl: filePath });
      wx.setStorageSync('userInfo', updatedUser);
      this.setData({
        userInfo: updatedUser,
        hasUserInfo: this.isUserInfoComplete()
      });
      hideLoading();
      showToast('头像已更新');
    } catch {
      hideLoading();
      showToast('头像更新失败');
    }
  },

  /**
   * 点击昵称，直接进入编辑状态
   */
  onNickNameEdit() {
    this.setData({ editingNickName: true });
  },

  /**
   * 保存昵称到后端
   */
  saveNickName(nickName: string) {
    const normalizedNickName = nickName.trim();
    if (!normalizedNickName) return;
    if (normalizedNickName === '微信用户') {
      showToast('请手动输入昵称');
      return;
    }
    if (normalizedNickName === this.data.userInfo?.nickName) {
      this.setData({ editingNickName: false });
      return;
    }
    showLoading('更新昵称...');
    UserService.updateUserInfo({ nickName: normalizedNickName })
      .then(updatedUser => {
        wx.setStorageSync('userInfo', updatedUser);
        this.setData({
          userInfo: updatedUser,
          editingNickName: false,
          hasUserInfo: this.isUserInfoComplete()
        });
        hideLoading();
        showToast('昵称已更新');
      })
      .catch(() => {
        hideLoading();
        showToast('昵称更新失败');
        this.setData({ editingNickName: false });
      });
  },

  /**
   * 昵称输入完成（失焦或回车）
   */
  onNickNameConfirm(e) {
    const nickName = e.detail.value;
    if (!nickName) {
      this.setData({ editingNickName: false });
      return;
    }
    (this as any).saveNickName(nickName);
  },

  /**
   * 输入昵称
   */
  onNickNameInput(e) {
    const nickName = e.detail.value;
    this.setData({
      'userInfo.nickName': nickName
    });
  },

  onInputChange(e: any) {
    // 仅更新本地状态，不保存到服务端（blur/confirm 时统一保存，避免双重调用）
    const nickName = e.detail.value;
    this.setData({ 'userInfo.nickName': nickName });
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？清除后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          const clearLocalStorage = () => {
            try {
              // 清除本地缓存
              wx.clearStorageSync();

              // 重置页面数据
              this.setData({
                userInfo: null,
                isAdmin: false,
                hasUserInfo: false,
                openid: null,
                isLoggingIn: false,
                editingNickName: false
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

          ImageCacheService.clear().then(clearLocalStorage, clearLocalStorage);
        }
      }
    });
  }
});
