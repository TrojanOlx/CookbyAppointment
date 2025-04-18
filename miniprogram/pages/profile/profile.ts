// 我的页面
// 用户信息接口
interface UserInfo {
  avatarUrl?: string;
  nickName?: string;
  gender?: number;
  province?: string;
  city?: string;
  country?: string;
}

// 页面数据接口
interface IPageData {
  userInfo: UserInfo | null;
  isAdmin: boolean;
  hasUserInfo: boolean;
  canIUseGetUserProfile: boolean;
}

// 页面方法接口
interface IPageMethods {
  onGetUserInfo: (e: any) => void;
  checkAdminStatus: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
}

Page<IPageData, IPageMethods>({
  data: {
    userInfo: null,
    isAdmin: false,
    hasUserInfo: false,
    canIUseGetUserProfile: false
  },

  onLoad() {
    // 检查是否可以使用getUserProfile接口
    if (typeof wx.getUserProfile === 'function') {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
    
    // 尝试从本地存储获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo,
        hasUserInfo: true
      });
      this.checkAdminStatus();
    }
  },
  
  // 获取用户信息
  onGetUserInfo(e: any) {
    if (this.data.canIUseGetUserProfile) {
      wx.getUserProfile({
        desc: '用于完善用户信息',
        success: (res) => {
          const userInfo = res.userInfo;
          wx.setStorageSync('userInfo', userInfo);
          this.setData({
            userInfo,
            hasUserInfo: true
          });
          this.checkAdminStatus();
        }
      });
    } else if (e.detail && e.detail.userInfo) {
      const userInfo = e.detail.userInfo;
      wx.setStorageSync('userInfo', userInfo);
      this.setData({
        userInfo,
        hasUserInfo: true
      });
      this.checkAdminStatus();
    }
  },

  // 检查管理员状态
  checkAdminStatus() {
    // 这里应该实现真实的管理员权限检查
    // 暂时使用模拟数据，将特定用户名作为管理员
    const adminUsernames = ['admin', '管理员'];
    const isAdmin = this.data.userInfo && 
      this.data.userInfo.nickName && 
      adminUsernames.includes(this.data.userInfo.nickName);
    
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