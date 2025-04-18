// 隐私政策页面
import { getPrivacyPolicy } from '../../utils/privacy'

interface WxPrivacy extends WechatMiniprogram.Wx {
  privacyAuthorize(options: {
    success?: () => void;
    fail?: (res: any) => void;
    complete?: () => void;
  }): void;
}

Page({
  data: {
    privacyContent: ''
  },

  onLoad() {
    // 获取隐私政策内容并转换为HTML格式
    this.setData({
      privacyContent: getPrivacyPolicy()
    });
  },

  // 用户接受隐私政策
  acceptPrivacy() {
    // 设置用户已接受隐私政策
    wx.setStorageSync('privacyAccepted', true);
    
    // 记录用户授权时间
    wx.setStorageSync('privacyAcceptedTime', new Date().getTime());
    
    // 授权完成后直接返回首页
    console.log('用户接受了隐私授权');
    wx.switchTab({
      url: '/pages/index/index'
    });
    
    // 注意：从2022年10月起，微信小程序提供的隐私授权由框架自动处理
    // 开发者通过在app.json中配置privacyPlugin即可，无需手动调用API
  },

  // 用户拒绝隐私政策
  rejectPrivacy() {
    wx.showModal({
      title: '提示',
      content: '需要同意隐私政策才能使用完整功能，是否退出小程序？',
      confirmText: '退出',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          // 用户选择退出
          wx.exitMiniProgram();
        }
      }
    });
  }
}); 