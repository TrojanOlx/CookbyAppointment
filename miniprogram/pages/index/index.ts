// index.ts
import { AppointmentService } from '../../services/appointmentService';
import { InventoryService } from '../../services/inventoryService';
import { getCurrentDate, dateDiff } from '../../utils/util';
const FamilyService = require('../../services/family');

// 获取应用实例
const app = getApp<IAppOption>();

let todayAppointmentsRequestId = 0;
let expiringItemsRequestId = 0;

const currentHomeScope = () => `${String(wx.getStorageSync('token') || '')}|${String(FamilyService.getActiveFamilyId() || '')}`;

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
    } else {
      todayAppointmentsRequestId += 1;
      expiringItemsRequestId += 1;
      this.setData({
        todayAppointments: [],
        expiringItems: [],
        loadingAppointments: false,
        loadingInventory: false
      });
    }
  },

  onHide() {
    todayAppointmentsRequestId += 1;
    expiringItemsRequestId += 1;
  },

  onUnload() {
    todayAppointmentsRequestId += 1;
    expiringItemsRequestId += 1;
  },

  async loadTodayAppointments() {
    const requestId = ++todayAppointmentsRequestId;
    const scope = currentHomeScope();
    const isCurrentRequest = () => requestId === todayAppointmentsRequestId && scope === currentHomeScope();
    this.setData({ loadingAppointments: true });
    try {
      const today = getCurrentDate();
      const res = await AppointmentService.getAppointmentListByDate(today);
      const list = (res.list || []).map((item: any) => ({
        ...item,
        dishCount: Array.isArray(item.dishes) ? item.dishes.length : 0
      }));
      if (!isCurrentRequest()) return;
      this.setData({ todayAppointments: list });
    } catch (e) {
      if (!isCurrentRequest()) return;
      this.setData({ todayAppointments: [] });
    } finally {
      if (isCurrentRequest()) this.setData({ loadingAppointments: false });
    }
  },

  async loadExpiringItems() {
    const requestId = ++expiringItemsRequestId;
    const scope = currentHomeScope();
    const isCurrentRequest = () => requestId === expiringItemsRequestId && scope === currentHomeScope();
    this.setData({ loadingInventory: true });
    try {
      const today = getCurrentDate();
      const res = await InventoryService.getExpiringItems(3, 1, 5);
      const list = (res.list || []).map((item: any) => {
        const diff = dateDiff(today, item.expiryDate);
        const isExpired = new Date(item.expiryDate) < new Date(today);
        return { ...item, daysLeft: isExpired ? 0 : diff, isExpired };
      });
      if (!isCurrentRequest()) return;
      this.setData({ expiringItems: list });
    } catch (e) {
      if (!isCurrentRequest()) return;
      this.setData({ expiringItems: [] });
    } finally {
      if (isCurrentRequest()) this.setData({ loadingInventory: false });
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
  },

  // 打开家庭采购二级页面
  navigateToShopping() {
    wx.navigateTo({
      url: '/pages/shopping/index'
    });
  },

  // 跳转到我的页面（未登录引导）
  navigateToProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  }
});
