// app.ts
import { initTestData } from './utils/storage';
import { hasUserAcceptedPrivacy, requestPrivacyAuthorization } from './utils/privacy';

App({
  globalData: {
    systemInfo: null as WechatMiniprogram.SystemInfo | null
  },
  
  onLaunch() {
    // 获取系统信息
    wx.getSystemInfo({
      success: res => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      }
    });
    
    // 初始化测试数据
    initTestData();
    
    // 处理隐私授权
    if (!hasUserAcceptedPrivacy()) {
      // 如果用户未接受隐私政策，引导到隐私政策页面
      wx.navigateTo({
        url: '/pages/privacy/privacy'
      });
    }
  },
});