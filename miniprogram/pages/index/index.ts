// index.ts
// 获取应用实例
const app = getApp<IAppOption>();

Page({
  data: {
    // 页面数据
  },

  onLoad() {
    // 页面加载
    console.log('欢迎页面加载完成');
  },

  onShow() {
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 0
      });
    }
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
