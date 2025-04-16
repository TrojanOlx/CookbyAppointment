// index.ts
// 获取应用实例
const app = getApp<IAppOption>();

Page({
  data: {
    // 页面数据
    safeAreaBottom: 0
  },

  onLoad() {
    // 页面加载
    console.log('欢迎页面加载完成');
    this.setSafeArea();
  },

  onShow() {
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  // 设置安全区域
  setSafeArea() {
    const systemInfo = (app.globalData as any).systemInfo;
    if (systemInfo) {
      // 如果已有系统信息
      this.processSafeArea(systemInfo);
    } else {
      // 重新获取系统信息
      wx.getSystemInfo({
        success: (res) => {
          this.processSafeArea(res);
        }
      });
    }
  },

  // 处理安全区域数据
  processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
    const safeAreaBottom = systemInfo.safeArea ? 
      (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;
    
    this.setData({
      safeAreaBottom
    });
  },

  // 跳转到菜单页面
  navigateToMenu() {
    wx.switchTab({
      url: '/pages/menu/menu'
    });
  },

  // 跳转到预约页面
  navigateToAppointment() {
    wx.switchTab({
      url: '/pages/appointment/appointment'
    });
  },

  // 跳转到库存页面
  navigateToInventory() {
    wx.switchTab({
      url: '/pages/inventory/inventory'
    });
  }
});
