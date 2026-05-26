import { getPrivacyPolicy } from '../../utils/privacy';

Page({
  data: {
    privacyContent: ''
  },

  onLoad() {
    this.setData({
      privacyContent: getPrivacyPolicy()
    });
  },

  acceptPrivacy() {
    wx.setStorageSync('privacyAccepted', true);
    wx.setStorageSync('privacyAcceptedTime', Date.now());
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  rejectPrivacy() {
    wx.showModal({
      title: '提示',
      content: '拒绝隐私政策将无法使用本小程序',
      confirmText: '重新查看',
      cancelText: '退出',
      success: (res) => {
        if (!res.confirm) {
          wx.exitMiniProgram();
        }
      }
    });
  }
});
