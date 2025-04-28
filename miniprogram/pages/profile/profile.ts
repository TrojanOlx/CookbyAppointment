// 我的页面
import { UserService } from '../../services/userService';
import { User } from '../../models/user';
import { showToast, showLoading, hideLoading } from '../../utils/util';
import { FileService } from '../../services/fileService';

// 页面数据接口
interface IPageData {
  userInfo: User | null;
  isAdmin: boolean;
  hasUserInfo: boolean;
  canIUseGetUserProfile: boolean;
  openid: string | null;
  isLoggingIn: boolean;
  editingNickName?: boolean;
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
  fetchUserInfo: () => Promise<void>;
  isUserInfoComplete: () => boolean;
  checkAndRedirect: (redirectUrl: string) => void;
  saveNickName: (nickName: string) => void;
  saveAvatar: (filePath: string) => Promise<void>;
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
    canIUseGetUserProfile: false,
    openid: null,
    isLoggingIn: false,
    editingNickName: false
  },

  onLoad() {
    // 检查是否可以使用getUserProfile接口
    if (typeof wx.getUserProfile === 'function') {
      this.setData({
        canIUseGetUserProfile: true
      });
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
    // 自动弹出头像上传弹窗
    if (this.data.userInfo && !this.data.userInfo.avatarUrl) {
      wx.showToast({ title: '请上传头像', icon: 'none' });
      setTimeout(() => {
        this.onChooseAvatar({});
      }, 500);
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
      showToast('获取用户信息失败');
      
      // 如果出现403或401错误，可能是token失效，清除token
      wx.removeStorageSync('token');
      this.setData({
        userInfo: null,
        hasUserInfo: false,
        isAdmin: false,
        openid: null
      });
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
      
      // 获取登录code
      const loginCode = await new Promise<string>((resolve, reject) => {
        wx.login({
          success: (res) => {
            if (res.code) {
              resolve(res.code);
            } else {
              reject(new Error('登录失败: ' + res.errMsg));
            }
          },
          fail: reject
        });
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

      // 检查用户信息是否完整
      const isUserInfoComplete = this.isUserInfoComplete();
      
      // 获取重定向URL（如果有）
      const redirectUrl = wx.getStorageSync('redirectUrl');
      
      // 如果用户信息不完整，先提示完善资料
      if (!isUserInfoComplete) {
        // 登录成功后，先弹出提示获取用户资料（昵称和头像）
        wx.showModal({
          title: '完善用户资料',
          content: '是否授权获取您的昵称和头像等信息？',
          confirmText: '立即获取',
          cancelText: '暂不',
          success: (modalRes) => {
            if (modalRes.confirm) {
              // 用户点击确认，触发获取用户资料
              this.getUserProfile();
              
              // 设置一个延时，在获取用户资料完成后检查是否需要重定向
              setTimeout(() => {
                this.checkAndRedirect(redirectUrl);
              }, 2000);
            } else {
              // 用户点击取消，如果没有手机号则提示绑定手机号
              if (this.data.userInfo && !this.data.userInfo.phoneNumber) {
                wx.showModal({
                  title: '绑定手机号',
                  content: '是否需要绑定您的手机号码？',
                  confirmText: '去绑定',
                  cancelText: '暂不',
                  success: (phoneModalRes) => {
                    if (phoneModalRes.confirm) {
                      wx.navigateTo({
                        url: '/pages/profile/settings/settings'
                      });
                    } else {
                      // 用户拒绝绑定手机号，检查是否需要重定向
                      this.checkAndRedirect(redirectUrl);
                    }
                  }
                });
              } else {
                // 无需绑定手机号，检查是否需要重定向
                this.checkAndRedirect(redirectUrl);
              }
            }
          }
        });
      } else {
        // 用户信息已完整，直接检查是否需要重定向
        this.checkAndRedirect(redirectUrl);
      }
    } catch (error) {
      console.error('登录失败:', error);
      this.setData({ isLoggingIn: false });
      showToast('登录失败，请重试');
    }
  },
  
  // 检查并执行重定向
  checkAndRedirect(redirectUrl: string) {
    if (redirectUrl) {
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
    wx.removeStorageSync('token');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');
    
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
        console.log("用户信息");
        console.log(res);
        
        // 没有获取到用户信息
        if (!res.userInfo) {
          showToast('获取用户信息失败');
          return;
        }
        
        // 更新用户信息
        const userInfo = {
          ...this.data.userInfo,
          nickName: res.userInfo.nickName,
          avatarUrl: res.userInfo.avatarUrl,
          gender: res.userInfo.gender,
          country: res.userInfo.country,
          province: res.userInfo.province,
          city: res.userInfo.city
        };
        
        // 调用接口更新用户信息
        showLoading('更新用户信息...');
        UserService.updateUserInfo(userInfo)
          .then(updatedUser => {
            wx.setStorageSync('userInfo', updatedUser);
            this.setData({
              userInfo: updatedUser,
              hasUserInfo: true
            });
            this.checkAdminStatus();
            hideLoading();
            
            // 显示成功提示
            showToast('资料获取成功');
            
            // 获取到用户资料后，提示获取手机号
            if (!updatedUser.phoneNumber) {
              setTimeout(() => {
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
              }, 500); // 延迟显示，避免与成功提示重叠
            }
          })
          .catch(err => {
            console.error('更新用户信息失败:', err);
            hideLoading();
            showToast('更新用户信息失败');
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
      // 用户同意授权，获取code
      const code = e.detail.code;
      console.log('获取手机号成功, code:', code);
      
      // 调用UserService获取手机号
      showLoading('获取手机号中...');
      UserService.getPhoneNumber(code)
        .then(result => {
          console.log('手机号信息:', result);
          
          // 更新用户信息中的手机号
          const userInfo = {
            ...this.data.userInfo,
            phoneNumber: result.phoneNumber
          };
          
          // 调用接口更新用户信息
          return UserService.updateUserInfo(userInfo);
        })
        .then(updatedUser => {
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
  
  // 获取用户信息
  onGetUserInfo(e: any) {
    // 先执行登录流程
    this.doLogin().then(() => {
      // 登录成功后，如果按钮方式获取了用户信息
      if (e && e.detail && e.detail.userInfo) {
        const userInfo = {
          ...this.data.userInfo,
          nickName: e.detail.userInfo.nickName,
          avatarUrl: e.detail.userInfo.avatarUrl,
          gender: e.detail.userInfo.gender,
          country: e.detail.userInfo.country,
          province: e.detail.userInfo.province,
          city: e.detail.userInfo.city
        };
        
        // 调用接口更新用户信息
        UserService.updateUserInfo(userInfo)
          .then(updatedUser => {
            wx.setStorageSync('userInfo', updatedUser);
            this.setData({
              userInfo: updatedUser,
              hasUserInfo: true
            });
            this.checkAdminStatus();
          })
          .catch(err => {
            console.error('更新用户信息失败:', err);
            showToast('更新用户信息失败');
          });
      }
    });
  },

  // 检查管理员状态
  async checkAdminStatus() {
    try {
      const result = await UserService.checkAdmin();
      this.setData({ isAdmin: result.isAdmin });
    } catch (error) {
      console.error('检查管理员状态失败:', error);
      
      // 失败时使用本地方式判断（备用）
      const adminOpenids = ['o-1-C6_A-LcLC4PFDA-sbcNFNUqE']; // 添加管理员的openid
      const isAdmin = this.data.openid && adminOpenids.includes(this.data.openid);
      this.setData({ isAdmin: Boolean(isAdmin) });
    }
  },
  
  // 页面导航
  navigateTo(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url
    });
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
      return;
    }
    // 兜底：手动选择
    const fileInfo = await FileService.uploadSingleImage('avatars');
    if (fileInfo && fileInfo.filePath) {
      try {
        const uploadRes = await UserService.updateAvatar(fileInfo.filePath);
        if (uploadRes && uploadRes.filePath) {
          await (this as any).saveAvatar(uploadRes.filePath);
        } else {
          showToast('头像上传失败');
        }
      } catch {
        showToast('头像上传失败');
      }
    }
  },

  /**
   * 保存头像到用户信息
   */
  async saveAvatar(filePath: string) {
    const userInfo = {
      ...this.data.userInfo,
      avatarUrl: filePath
    };
    showLoading('更新头像...');
    try {
      const updatedUser = await UserService.updateUserInfo(userInfo);
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
   * 点击昵称，弹出选择框
   */
  onNickNameEdit() {
    const wxNickName = this.data.userInfo?.nickName || '';
    wx.showActionSheet({
      itemList: [
        wxNickName ? `使用微信昵称（${wxNickName}）` : '使用微信昵称',
        '自定义昵称'
      ],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 选择微信昵称
          this.setData({
            'userInfo.nickName': wxNickName,
            editingNickName: false
          });
          (this as any).saveNickName(wxNickName);
        } else if (res.tapIndex === 1) {
          // 进入自定义昵称编辑状态
          this.setData({ editingNickName: true });
        }
      }
    });
  },

  /**
   * 保存昵称到后端
   */
  saveNickName(nickName: string) {
    if (!nickName) return;
    const userInfo = {
      ...this.data.userInfo,
      nickName
    };
    showLoading('更新昵称...');
    UserService.updateUserInfo(userInfo)
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
      .catch(err => {
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
  }
}); 