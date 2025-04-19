import { Dish } from '../../../models/dish';
import { DishService } from '../../../services/dishService';
import { showSuccess, showConfirm, showLoading, hideLoading, showToast } from '../../../utils/util';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dish: {} as Dish,
    dishId: '',
    safeAreaBottom: 0,
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.id) {
      this.setData({
        dishId: options.id
      });
      this.loadDish();
    }
    
    this.setSafeArea();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面都重新加载数据，以便获取最新的编辑结果
    if (this.data.dishId) {
      this.loadDish();
    }
  },

  // 设置安全区域
  setSafeArea() {
    const app = getApp<IAppOption>();
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

  /**
   * 加载菜品数据
   */
  async loadDish() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    showLoading('加载中');
    
    try {
      const dish = await DishService.getDishDetail(this.data.dishId);
      this.setData({ dish });
    } catch (error) {
      console.error('获取菜品详情失败:', error);
      showToast('获取菜品详情失败');
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } finally {
      hideLoading();
      this.setData({ loading: false });
    }
  },

  /**
   * 编辑菜品
   */
  editDish() {
    wx.navigateTo({
      url: `../add/add?id=${this.data.dishId}`
    });
  },

  /**
   * 删除菜品
   */
  async deleteDish() {
    const confirmed = await showConfirm('确认删除', '确定要删除这个菜品吗？');
    if (confirmed) {
      try {
        showLoading('删除中');
        const result = await DishService.deleteDish(this.data.dishId);
        if (result.success) {
          hideLoading();
          showSuccess('删除成功');
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          throw new Error('删除失败');
        }
      } catch (error) {
        hideLoading();
        console.error('删除菜品失败:', error);
        showToast('删除菜品失败');
      }
    }
  }
}) 