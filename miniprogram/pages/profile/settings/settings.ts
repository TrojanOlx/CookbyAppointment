// pages/profile/settings/settings.ts
import { showToast } from '../../../utils/util';
import { getUserProfile, getPhoneNumber as authGetPhoneNumber } from '../../../utils/auth';

// 页面数据接口
interface IPageData {
  phoneNumber: string | null;
  notifyAppointment: boolean;
  notifyReview: boolean;
}

// 页面方法接口
interface IPageMethods {
  getPhoneNumber: (e: WechatMiniprogram.ButtonGetPhoneNumber) => void;
  updateUserInfo: () => void;
  switchChange: (e: WechatMiniprogram.SwitchChange) => void;
  clearCache: () => void;
  navigateTo: (e: WechatMiniprogram.TouchEvent) => void;
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
  getPhoneNumber(e: WechatMiniprogram.ButtonGetPhoneNumber) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // 用户同意授权，获取code
      const code = e.detail.code;
      console.log('获取手机号成功, code:', code);
      
      // 调用工具函数获取手机号
      wx.showLoading({ title: '绑定中...', mask: true });
      authGetPhoneNumber(code)
        .then(result => {
          console.log('手机号信息:', result);
          this.setData({ phoneNumber: result.phoneNumber });
          wx.showToast({
            title: '手机号绑定成功',
            icon: 'success'
          });
        })
        .catch(err => {
          console.error('获取手机号失败:', err);
          wx.showToast({
            title: '手机号绑定失败',
            icon: 'none'
          });
        })
        .then(() => {
          // 无论成功或失败都执行
          wx.hideLoading();
        });
    } else {
      console.error('获取手机号失败:', e.detail.errMsg);
      showToast('获取手机号失败');
    }
  },
  
  // 更新用户信息
  updateUserInfo() {
    getUserProfile().then(userInfo => {
      showToast('用户信息更新成功');
    }).catch(err => {
      console.error('更新用户信息失败:', err);
      showToast('更新用户信息失败');
    });
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
      content: '确定要清除本地缓存吗？这将清除您的浏览记录和临时数据，但不会影响您的账号信息。',
      success: (res) => {
        if (res.confirm) {
          // 保留必要的登录信息和用户设置
          const userInfo = wx.getStorageSync('userInfo');
          const openid = wx.getStorageSync('openid');
          const phoneNumber = wx.getStorageSync('phoneNumber');
          
          // 清除缓存
          wx.clearStorageSync();
          
          // 恢复必要的信息
          if (userInfo) wx.setStorageSync('userInfo', userInfo);
          if (openid) wx.setStorageSync('openid', openid);
          if (phoneNumber) wx.setStorageSync('phoneNumber', phoneNumber);
          
          showToast('缓存已清除');
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