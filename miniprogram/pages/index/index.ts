// index.ts
import { AppointmentService } from '../../services/appointmentService';
import { InventoryService } from '../../services/inventoryService';
import { getCurrentDate, dateDiff } from '../../utils/util';

// 获取应用实例
const app = getApp<IAppOption>();

Page({
  data: {
    safeAreaBottom: 0,
    isLoggedIn: false,
    todayAppointments: [] as any[],
    expiringItems: [] as any[],
    loadingAppointments: false,
    loadingInventory: false,
    today: ''
  },

  onLoad() {
    this.setSafeArea();
    const today = getCurrentDate();
    this.setData({ today });
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 0 });
    }
    const token = wx.getStorageSync('token');
    const isLoggedIn = !!token;
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.loadTodayAppointments();
      this.loadExpiringItems();
    }
  },

  async loadTodayAppointments() {
    this.setData({ loadingAppointments: true });
    try {
      const today = getCurrentDate();
      const res = await AppointmentService.getAppointmentListByDate(today);
      const list = (res.list || []).map((item: any) => ({
        ...item,
        dishCount: Array.isArray(item.dishes) ? item.dishes.length : 0
      }));
      this.setData({ todayAppointments: list });
    } catch (e) {
      this.setData({ todayAppointments: [] });
    } finally {
      this.setData({ loadingAppointments: false });
    }
  },

  async loadExpiringItems() {
    this.setData({ loadingInventory: true });
    try {
      const today = getCurrentDate();
      const res = await InventoryService.getExpiringItems(3, 1, 5);
      const list = (res.list || []).map((item: any) => {
        const diff = dateDiff(today, item.expiryDate);
        const isExpired = new Date(item.expiryDate) < new Date(today);
        return { ...item, daysLeft: isExpired ? 0 : diff, isExpired };
      });
      this.setData({ expiringItems: list });
    } catch (e) {
      this.setData({ expiringItems: [] });
    } finally {
      this.setData({ loadingInventory: false });
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

  navigateToAppointmentDetail() {
    wx.switchTab({ url: '/pages/appointment/appointment' });
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
    wx.navigateTo({
      url: '/pages/inventory/inventory'
    });
  }
});
