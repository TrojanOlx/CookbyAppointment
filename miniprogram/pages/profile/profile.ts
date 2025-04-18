// 我的页面
import { login, isLoggedIn, logout, getOpenId, getUserProfile as authGetUserProfile } from '../../utils/auth';
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
  showLoginOptions: () => void;
  getPhoneNumber: (e: WechatMiniprogram.ButtonGetPhoneNumber) => void;
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
  
  // 显示登录选项菜单
  showLoginOptions() {
    wx.showActionSheet({
      itemList: ['授权登录', '获取用户资料', '获取手机号'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0: // 授权登录
            this.doLogin();
            break;
          case 1: // 获取用户资料
            this.getUserProfile();
            break;
          case 2: // 获取手机号
            // 由于获取手机号需要使用button组件，这里只能提示用户
            wx.showModal({
              title: '获取手机号',
              content: '请使用设置页面的绑定手机号功能',
              confirmText: '去设置',
              cancelText: '取消',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.navigateTo({
                    url: '/pages/profile/settings/settings'
                  });
                }
              }
            });
            break;
        }
      },
      fail: (err) => {
        console.error('显示操作菜单失败:', err);
      }
    });
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
      
      // 登录成功后，弹出提示获取用户资料
      if (!this.data.userInfo) {
        wx.showModal({
          title: '完善资料',
          content: '是否授权获取您的用户资料？',
          confirmText: '确定',
          cancelText: '暂不',
          success: (res) => {
            if (res.confirm) {
              // 用户点击确定按钮，获取用户资料
              this.getUserProfile();
            }
          }
        });
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
    // 这个方法必须由用户点击事件直接触发
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
        
        // 获取到用户资料后，提示获取手机号
        wx.showModal({
          title: '绑定手机号',
          content: '是否需要绑定您的手机号码？',
          confirmText: '去绑定',
          cancelText: '暂不',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.navigateTo({
                url: '/pages/profile/settings/settings'
              });
            }
          }
        });
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
        showToast('获取用户信息失败');
      }
    });
  },
  
  // 获取手机号码（需要在wxml的button组件上设置open-type="getPhoneNumber"）
  getPhoneNumber(e: WechatMiniprogram.ButtonGetPhoneNumber) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // 用户同意授权，可以将信息发送到后端解密
      console.log('获取手机号成功:', e.detail);
      
      // 这里需要将加密数据发送到服务端解密
      // 示例代码，实际需要根据后端接口调整
      // wx.request({
      //   url: '后端解密接口',
      //   method: 'POST',
      //   data: {
      //     encryptedData: e.detail.encryptedData,
      //     iv: e.detail.iv,
      //     sessionKey: wx.getStorageSync('session_key')
      //   },
      //   success: (res) => {
      //     // 处理成功响应
      //     showToast('手机号绑定成功');
      //   },
      //   fail: (err) => {
      //     console.error('手机号解密失败:', err);
      //     showToast('手机号绑定失败');
      //   }
      // });
      
      showToast('手机号授权成功');
    } else {
      console.error('获取手机号失败:', e.detail.errMsg);
      showToast('获取手机号失败');
    }
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
    const adminOpenids = ['o-1-C6_A-LcLC4PFDA-sbcNFNUqE']; // 添加管理员的openid
    
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