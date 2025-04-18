// app.ts
import { initTestData } from './utils/storage';

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
  },
});