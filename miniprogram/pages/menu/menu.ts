import { Dish, DishType } from '../../models/dish';
import { DishService } from '../../services/dishService';
import { showLoading, hideLoading, showToast } from '../../utils/util';
import { UserService } from '../../services/userService';

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
    total: 0,
    isAdmin: false, // 是否为管理员
    refresherTriggered: false // 下拉刷新状态
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
    this.checkAdminStatus();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时重新加载数据，以获取最新数据
    this.loadDishes(true);
    this.checkAdminStatus();
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    try {
      const result = await UserService.checkAdmin();
      this.setData({ isAdmin: result.isAdmin });
    } catch (error) {
      console.error('检查管理员状态失败:', error);
      this.setData({ isAdmin: false });
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
    if (this.data.loading) {
      console.log("正在加载中，忽略此次请求");
      return;
    }
    
    console.log("开始加载菜品数据", refresh ? "刷新" : "加载更多", "当前页:", this.data.currentPage);
    
    // 如果是刷新，显示顶部loading，否则不显示全屏loading
    if (refresh) {
      // 下拉刷新已经有自己的loading，这里不需要再显示
      if (!this.data.refresherTriggered && !wx.canIUse('onPullDownRefresh')) {
        showLoading('刷新中');
      }
    } else {
      // 加载更多时，只设置loading状态，不显示全屏loading
      this.setData({ loading: true });
    }
    
    try {
      const page = refresh ? 1 : this.data.currentPage;
      
      // 如果当前没有更多数据，并且不是刷新操作，则直接返回
      if (!this.data.hasMore && !refresh) {
        console.log("没有更多数据，取消加载");
        return;
      }
      
      console.log("请求数据，页码:", page, "每页数量:", this.data.pageSize, "类型:", this.data.selectedType || "全部");
      
      const result = await DishService.getDishList(
        page,
        this.data.pageSize,
        this.data.selectedType || undefined
      );
      
      console.log("获取数据成功，数量:", result.list.length, "总数:", result.total);
      
      // 计算是否还有更多数据
      const hasMore = result.list.length >= this.data.pageSize;
      
      this.setData({
        dishes: refresh ? result.list : [...this.data.dishes, ...result.list],
        currentPage: page + 1,
        hasMore: hasMore,
        total: result.total,
        loading: false
      });
      
      console.log("数据更新完成，当前菜品数:", this.data.dishes.length, "还有更多:", hasMore);
      
      // 如果没有更多数据，显示提示
      if (!hasMore && !refresh && result.list.length > 0) {
        wx.showToast({
          title: '没有更多菜品了',
          icon: 'none',
          duration: 1500
        });
      }
      
      // 如果是刷新操作并且有数据变化，显示提示
      if (refresh && result.list.length > 0 && !this.data.refresherTriggered) {
        wx.showToast({
          title: '刷新成功',
          icon: 'success',
          duration: 1500
        });
      }
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
   * 下拉刷新 - scroll-view刷新器触发
   */
  onRefresherRefresh() {
    console.log("下拉刷新触发");
    // 设置刷新状态
    this.setData({
      refresherTriggered: true
    });
    
    // 执行刷新操作
    this.loadDishes(true).then(() => {
      // 延迟关闭刷新状态，提供更好的视觉反馈
      setTimeout(() => {
        this.setData({
          refresherTriggered: false
        });
        console.log("下拉刷新完成");
      }, 500);
    }).catch(() => {
      // 出错时也需要关闭刷新状态
      this.setData({
        refresherTriggered: false
      });
      console.log("下拉刷新出错");
    });
  },
  
  /**
   * 下拉中
   */
  onRefresherPulling() {
    console.log("正在下拉...");
  },
  
  /**
   * 刷新复位
   */
  onRefresherRestore() {
    console.log("刷新复位");
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    // 防抖处理，避免频繁触发
    if (this.loadMoreTimer) {
      clearTimeout(this.loadMoreTimer);
    }
    
    this.loadMoreTimer = setTimeout(() => {
      if (this.data.hasMore && !this.data.loading) {
        console.log("触底加载数据");
        this.loadDishes();
      } else if (!this.data.hasMore && this.data.dishes.length > 0) {
        // 如果没有更多数据，显示提示
        wx.showToast({
          title: '没有更多菜品了',
          icon: 'none',
          duration: 1000
        });
      }
    }, 200);
  },
  
  /**
   * 处理scroll-view滚动到底部事件
   */
  onScrollToLower() {
    console.log("scroll-view触底");
    // 使用相同的防抖逻辑
    if (this.loadMoreTimer) {
      clearTimeout(this.loadMoreTimer);
    }
    
    this.loadMoreTimer = setTimeout(() => {
      if (this.data.hasMore && !this.data.loading) {
        console.log("开始加载更多数据");
        this.loadDishes();
      } else if (!this.data.hasMore && this.data.dishes.length > 0) {
        // 如果没有更多数据，显示提示
        wx.showToast({
          title: '没有更多菜品了',
          icon: 'none',
          duration: 1000
        });
      }
    }, 200);
  },
  
  loadMoreTimer: null as any,

  /**
   * 原生下拉刷新 - 依然保留，以防scroll-view外部的下拉
   */
  onPullDownRefresh() {
    console.log("原生下拉刷新触发");
    // 调用刷新方法
    this.loadDishes(true).then(() => {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh();
    });
  },
}); 