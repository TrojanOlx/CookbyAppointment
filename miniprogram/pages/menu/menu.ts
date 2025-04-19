import { Dish, DishType, SpicyLevel } from '../../models/dish';
import { DishService } from '../../services/dishService';
import { showLoading, hideLoading, showToast } from '../../utils/util';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dishes: [] as Dish[],
    selectedType: '', // 空字符串表示全部类型
    dishTypes: [] as string[], // 菜品类型列表
    pageSize: 10,
    currentPage: 1,
    hasMore: true,
    loading: false,
    safeAreaBottom: 0,
    total: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 初始化菜品类型
    this.setData({
      dishTypes: Object.values(DishType)
    });
    
    this.loadDishes(true);
    this.setSafeArea();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时重新加载数据，以获取最新数据
    this.loadDishes(true);
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  /**
   * 设置安全区域
   */
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

  /**
   * 处理安全区域数据
   */
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
  async loadDishes(refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    showLoading('加载中');
    
    try {
      const page = refresh ? 1 : this.data.currentPage;
      const result = await DishService.getDishList(
        page,
        this.data.pageSize,
        this.data.selectedType || undefined
      );
      
      this.setData({
        dishes: refresh ? result.list : [...this.data.dishes, ...result.list],
        currentPage: refresh ? 1 : this.data.currentPage + 1,
        hasMore: result.list.length >= this.data.pageSize,
        total: result.total,
        loading: false
      });
    } catch (error) {
      console.error('获取菜品列表失败:', error);
      showToast('获取菜品列表失败');
      this.setData({ loading: false });
    } finally {
      hideLoading();
      if (refresh && wx.stopPullDownRefresh) {
        wx.stopPullDownRefresh();
      }
    }
  },

  /**
   * 选择类型
   */
  selectType(e: any) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      selectedType: type,
      currentPage: 1,
      dishes: []
    });
    this.loadDishes(true);
  },

  /**
   * 跳转到菜品详情页
   */
  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `./detail/detail?id=${id}`
    });
  },

  /**
   * 跳转到添加菜品页
   */
  goToAdd() {
    wx.navigateTo({
      url: './add/add'
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadDishes(true);
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadDishes();
    }
  }
}); 