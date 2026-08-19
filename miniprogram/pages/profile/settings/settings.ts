// pages/profile/settings/settings.ts
import { showToast } from '../../../utils/util';
import { UserService } from '../../../services/userService';
import { ImageCacheService } from '../../../utils/imageCache';
import { getAuthSessionGeneration } from '../../../utils/auth';

let settingsLoginRequestId = 0;
let phoneBinding = false;

// 页面数据接口
interface IPageData {
  phoneNumber: string | null;
  notifyAppointment: boolean;
  notifyReview: boolean;
}

// 页面方法接口
interface IPageMethods {
  getPhoneNumber: (e: WechatMiniprogram.ButtonGetPhoneNumber) => void;
  editProfile: () => void;
  switchChange: (e: WechatMiniprogram.SwitchChange) => void;
  clearCache: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
  ensureLoggedIn: () => Promise<void>;
  wxLoginCode: () => Promise<string>;
}

Page<IPageData, IPageMethods>({

  /**
   * 页面的初始数据
   */
  data: {
    phoneNumber: null,
    notifyAppointment: true,
    notifyReview: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 从缓存获取设置
    const phoneNumber = wx.getStorageSync('phoneNumber');
    const notifyAppointment = wx.getStorageSync('notifyAppointment') !== false;
    const notifyReview = wx.getStorageSync('notifyReview') !== false;

    this.setData({
      phoneNumber,
      notifyAppointment,
      notifyReview
    });
  },

  wxLoginCode() {
    return new Promise<string>((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res.code);
          } else {
            reject(new Error(res.errMsg || 'wx.login 未返回 code'));
          }
        },
        fail: reject
      });
    });
  },

  async ensureLoggedIn() {
    if (wx.getStorageSync('token')) {
      return;
    }

    const requestId = ++settingsLoginRequestId;
    const sessionGeneration = getAuthSessionGeneration();
    const code = await this.wxLoginCode();
    if (
      requestId !== settingsLoginRequestId
      || sessionGeneration !== getAuthSessionGeneration()
      || wx.getStorageSync('token')
    ) return;
    const loginResult = await UserService.login(code);
    if (
      requestId !== settingsLoginRequestId
      || sessionGeneration !== getAuthSessionGeneration()
      || wx.getStorageSync('token')
    ) return;
    if (!loginResult.token) {
      throw new Error('登录返回数据不完整，缺少 token');
    }

    wx.setStorageSync('token', loginResult.token);
    wx.setStorageSync('openid', loginResult.openid);
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    settingsLoginRequestId += 1;
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  // 获取手机号
  async getPhoneNumber(e: WechatMiniprogram.ButtonGetPhoneNumber) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      if (phoneBinding) return;
      // 用户同意授权，获取code
      const code = e.detail.code;
      console.log('获取手机号成功, code:', code);

      if (!code) {
        showToast('获取手机号失败');
        return;
      }

      wx.showLoading({ title: '绑定中...', mask: true });
      phoneBinding = true;
      const bindingGeneration = getAuthSessionGeneration();
      try {
        await this.ensureLoggedIn();
        if (bindingGeneration !== getAuthSessionGeneration()) return;
        const openid = String(wx.getStorageSync('openid') || '');
        const sessionGeneration = getAuthSessionGeneration();
        if (!openid) throw new Error('登录状态无效');
        const result = await UserService.getPhoneNumber(code);
        if (
          sessionGeneration !== getAuthSessionGeneration()
          || String(wx.getStorageSync('openid') || '') !== openid
        ) return;
        console.log('手机号信息:', result);
        this.setData({ phoneNumber: result.phoneNumber });
        wx.setStorageSync('phoneNumber', result.phoneNumber);
        wx.showToast({
          title: '手机号绑定成功',
          icon: 'success'
        });
      } catch (err) {
        console.error('获取手机号失败:', err);
        wx.showToast({
          title: '手机号绑定失败',
          icon: 'none'
        });
      } finally {
        phoneBinding = false;
        wx.hideLoading();
      }
    } else {
      console.error('获取手机号失败:', e.detail.errMsg);
      showToast(e.detail.errMsg === 'getPhoneNumber:fail user deny' ? '已取消授权' : '获取手机号失败');
    }
  },

  editProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  // 开关切换
  switchChange(e: WechatMiniprogram.SwitchChange) {
    const type = e.currentTarget.dataset.type;
    const value = e.detail.value;

    if (type === 'appointment') {
      this.setData({ notifyAppointment: value });
      wx.setStorageSync('notifyAppointment', value);
    } else if (type === 'review') {
      this.setData({ notifyReview: value });
      wx.setStorageSync('notifyReview', value);
    }
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除图片等临时缓存吗？这不会影响登录状态、家庭选择和账号信息。',
      success: (res) => {
        if (res.confirm) {
          ImageCacheService.clear()
            .then(() => showToast('缓存已清除'))
            .catch((error) => {
              console.error('清除缓存失败:', error);
              showToast('清除缓存失败');
            });
        }
      }
    });
  },

  // 页面导航
  navigateTo(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  }
})
