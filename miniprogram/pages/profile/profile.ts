// 我的页面
import { login, isLoggedIn, logout, getOpenId } from '../../utils/auth';
import { showToast, showLoading, hideLoading } from '../../utils/util';

// 用户信息接口
interface UserInfo {
  avatarUrl?: string;
  nickName?: string;
  gender?: number;
  province?: string;
  city?: string;
  country?: string;
  openid?: string;
}

// 页面数据接口
interface IPageData {
  userInfo: UserInfo | null;
  isAdmin: boolean;
  hasUserInfo: boolean;
  canIUseGetUserProfile: boolean;
  openid: string | null;
  isLoggingIn: boolean;
}

// 页面方法接口
interface IPageMethods {
  onGetUserInfo: (e: any) => void;
  checkAdminStatus: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
  doLogin: () => Promise<void>;
  doLogout: () => void;
  getUserProfile: () => void;
}

Page<IPageData, IPageMethods>({
  data: {
    userInfo: null,
    isAdmin: false,
    hasUserInfo: false,
    canIUseGetUserProfile: false,
    openid: null,
    isLoggingIn: false
  },

  onLoad() {
    // 检查是否可以使用getUserProfile接口
    if (typeof wx.getUserProfile === 'function') {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
    
    // 检查是否已登录
    if (isLoggedIn()) {
      // 获取用户的openid
      const openid = getOpenId();
      this.setData({ openid });

      // 尝试从本地存储获取用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.setData({
          userInfo,
          hasUserInfo: true
        });
        this.checkAdminStatus();
      }
    }
  },
  
  // 执行登录
  async doLogin() {
    try {
      this.setData({ isLoggingIn: true });
      
      // 调用wx.login获取code，并换取openid等信息
      const loginResult = await login();
      
      this.setData({
        openid: loginResult.openid,
        isLoggingIn: false
      });
      
      showToast('登录成功');
      
      // 如果还没有用户信息，尝试获取
      if (!this.data.userInfo && this.data.canIUseGetUserProfile) {
        this.getUserProfile();
      }
    } catch (error) {
      console.error('登录失败:', error);
      this.setData({ isLoggingIn: false });
      showToast('登录失败，请重试');
    }
  },
  
  // 退出登录
  doLogout() {
    logout();
    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false,
      openid: null
    });
    showToast('已退出登录');
  },
  
  // 获取用户信息 - 新版本API (wx.getUserProfile)
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户信息',
      success: (res) => {
        const userInfo: UserInfo = res.userInfo;
        // 如果已登录，将openid添加到用户信息中
        if (this.data.openid) {
          userInfo.openid = this.data.openid;
        }
        wx.setStorageSync('userInfo', userInfo);
        this.setData({
          userInfo,
          hasUserInfo: true
        });
        this.checkAdminStatus();
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
      }
    });
  },
  
  // 获取用户信息
  onGetUserInfo(e: any) {
    // 先执行登录流程
    this.doLogin().then(() => {
      // 登录成功后，如果按钮方式获取了用户信息
      if (e && e.detail && e.detail.userInfo) {
        const userInfo: UserInfo = e.detail.userInfo;
        // 将openid添加到用户信息中
        if (this.data.openid) {
          userInfo.openid = this.data.openid;
        }
        wx.setStorageSync('userInfo', userInfo);
        this.setData({
          userInfo,
          hasUserInfo: true
        });
        this.checkAdminStatus();
      }
    });
  },

  // 检查管理员状态
  checkAdminStatus() {
    // 这里应该实现真实的管理员权限检查
    // 可以基于openid或unionid判断用户是否为管理员
    // 暂时使用模拟数据，将特定用户名作为管理员
    const adminUsernames = ['admin', '管理员'];
    const adminOpenids = ['your-admin-openid']; // 添加管理员的openid
    
    // 通过用户昵称判断
    let isAdmin = this.data.userInfo && 
      this.data.userInfo.nickName && 
      adminUsernames.includes(this.data.userInfo.nickName);
      
    // 通过openid判断
    if (!isAdmin && this.data.openid) {
      isAdmin = adminOpenids.includes(this.data.openid);
    }
    
    this.setData({ isAdmin: Boolean(isAdmin) });
    
    // 保存管理员状态
    wx.setStorageSync('isAdmin', isAdmin);
  },
  
  // 页面导航
  navigateTo(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url
    });
  }
}); 