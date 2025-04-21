import { Dish, DishType } from '../../../models/dish';
import { Appointment, MealType } from '../../../models/appointment';
import { AppointmentService } from '../../../services/appointmentService';
import { DishService } from '../../../services/dishService';
import { formatDate, showError, showSuccess, showToast, showLoading, hideLoading } from '../../../utils/util';

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 每页加载的菜品数量
const PAGE_SIZE = 10;

Page({
  data: {
    date: '', // YYYY-MM-DD 格式的日期
    dishes: [] as Dish[], // 所有菜品列表
    filteredDishes: [] as Dish[], // 过滤后的菜品列表
    selectedDishes: {} as Record<string, boolean>, // 已选择的菜品ID映射
    selectedType: '', // 当前选择的菜品类型
    selectedMealType: MealType.Lunch, // 当前选择的餐次
    searchKeyword: '', // 搜索关键词
    editMode: false, // 是否是编辑模式
    appointmentId: '', // 编辑的预约ID
    isLoading: true, // 加载状态
    selectedCount: 0, // 已选择的菜品数量
    isRefreshing: false, // 是否正在刷新
    isLoadingMore: false, // 是否正在加载更多
    currentPage: 1, // 当前页码
    hasMoreData: true, // 是否还有更多数据
    headerHeight: 0, // 顶部固定区域的高度
    bottomHeight: 0, // 底部固定区域的高度
    filteredTotal: 0, // 筛选后的总菜品数量
    scrollTop: 0,
    lastScrollTop: 0,
    isNearBottom: false,
    dishTypes: [] as string[], // 菜品类型列表
  },

  // 搜索的定时器
  searchTimer: null as number | null,

  async onLoad(options) {
    // 初始化菜品类型
    this.setData({
      dishTypes: Object.values(DishType),
      isLoading: true
    });
    
    try {
      if (options.id) {
        // 编辑模式，加载预约数据
        showLoading('加载中');
        const appointment = await AppointmentService.getAppointmentDetail(options.id);
        
        if (appointment) {
          // 处理dishes字段(可能是字符串数组或对象数组)
          let selectedDishes: Record<string, boolean> = {};
          let selectedCount = 0;
          
          if (appointment.dishes && Array.isArray(appointment.dishes)) {
            if (appointment.dishes.length > 0) {
              if (typeof appointment.dishes[0] === 'string') {
                // 如果dishes是字符串ID数组
                selectedDishes = (appointment.dishes as string[]).reduce((acc, id) => {
                  acc[id] = true;
                  return acc;
                }, {} as Record<string, boolean>);
                selectedCount = appointment.dishes.length;
              } else {
                // 如果dishes是对象数组
                selectedDishes = (appointment.dishes as Dish[]).reduce((acc, dish) => {
                  if (dish.id) {
                    acc[dish.id] = true;
                  }
                  return acc;
                }, {} as Record<string, boolean>);
                selectedCount = Object.keys(selectedDishes).length;
              }
            }
          }

          this.setData({
            date: appointment.date,
            selectedMealType: appointment.mealType,
            selectedDishes,
            editMode: true,
            appointmentId: options.id,
            selectedCount
          });
          
          wx.setNavigationBarTitle({
            title: '编辑预约'
          });
          hideLoading();
        } else {
          hideLoading();
          showError('预约数据不存在');
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
          return;
        }
      } else if (options.date) {
        // 新建模式，设置日期
        this.setData({
          date: options.date,
          selectedDishes: {}
        });
      } else {
        showError('参数错误');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }
      
      // 分页加载第一页数据
      await this.loadPageData(1);
      
      // 计算固定顶部区域的高度
      this.calculateHeaderHeight();
    } catch (error) {
      console.error('加载数据失败', error);
      showError('加载数据失败');
      hideLoading();
      this.setData({
        isLoading: false
      });
    }
  },

  onReady() {
    this.updateLayoutHeight();
  },

  updateLayoutHeight() {
    const query = wx.createSelectorQuery();
    
    // 计算顶部固定区域高度
    query.select('.fixed-top').boundingClientRect(rect => {
      if (rect) {
        this.setData({
          headerHeight: rect.height
        });
      }
    });

    // 计算底部固定区域高度
    query.select('.bottom-fixed-area').boundingClientRect(rect => {
      if (rect) {
        const actualHeight = rect.height;
        this.setData({
          bottomHeight: actualHeight
        }, () => {
          // 只有在底部且有选中项时才调整滚动位置
          if (this.data.isNearBottom && this.data.selectedCount > 0) {
            wx.nextTick(() => {
              this.setData({
                scrollTop: this.data.lastScrollTop + actualHeight
              });
            });
          }
        });
      }
    });

    query.exec();
  },

  // 计算顶部固定区域的高度并设置CSS变量
  calculateHeaderHeight() {
    const query = wx.createSelectorQuery();
    query.select('.fixed-top').boundingClientRect();
    query.exec(res => {
      if (res && res[0]) {
        const headerHeight = res[0].height;
        this.setData({
          headerHeight
        });
        
        // 设置 CSS 变量，添加一个小偏移量确保内容不会被遮挡
        wx.getSystemInfo({
          success: (sysInfo) => {
            const ratio = sysInfo.windowWidth / 750; // rpx 到 px 的转换比例
            const headerHeightRpx = headerHeight / ratio;
            // 修改为更小的偏移，适应更紧凑的界面
            const styleString = `--header-height: ${headerHeightRpx}rpx`;
            
            wx.nextTick(() => {
              this.setData({
                cssVars: styleString
              });
            });
          }
        });
      }
    });
  },

  // 分页加载数据
  async loadPageData(page: number) {
    const { selectedType, searchKeyword } = this.data;
    
    console.log('加载数据开始，设置isLoading=', page === 1);
    this.setData({ isLoading: page === 1 });
    if (page === 1) {
      showLoading('加载中');
    }
    
    try {
      let dishesResult;
      
      // 根据不同条件调用不同的API
      if (searchKeyword) {
        // 如果有搜索关键词，使用搜索API
        console.log('使用搜索API，关键词:', searchKeyword);
        dishesResult = await DishService.searchDish(searchKeyword, page, PAGE_SIZE);
      } else {
        // 否则使用普通列表查询，可传入类型过滤
        console.log('使用普通查询API，类型:', selectedType || '全部');
        dishesResult = await DishService.getDishList(page, PAGE_SIZE, selectedType || undefined);
      }
      
      console.log('接收到数据:', dishesResult.list.length, '条记录，总数:', dishesResult.total);
      const dishes = dishesResult.list;
      const total = dishesResult.total;
      
      this.setData({
        dishes: page === 1 ? dishes : [...this.data.dishes, ...dishes],
        filteredDishes: page === 1 ? dishes : [...this.data.filteredDishes, ...dishes],
        currentPage: page,
        hasMoreData: dishes.length >= PAGE_SIZE && this.data.filteredDishes.length < total,
        filteredTotal: total,
        isRefreshing: false,
        isLoadingMore: false,
        isLoading: false
      }, () => {
        console.log('数据加载完成，当前isLoading=', this.data.isLoading);
      });
      
      if (page === 1) {
        hideLoading();
      }
    } catch (error) {
      console.error('加载菜品数据失败:', error);
      showToast('加载菜品数据失败');
      this.setData({
        isRefreshing: false,
        isLoadingMore: false,
        isLoading: false
      }, () => {
        console.log('数据加载出错，当前isLoading=', this.data.isLoading);
      });
      if (page === 1) {
        hideLoading();
      }
    }
  },

  // 刷新数据
  async onRefresh() {
    if (this.data.isRefreshing) return;
    
    this.setData({ isRefreshing: true });
    
    try {
      // 重置到第一页
      this.setData({ currentPage: 1 });
      
      // 重新加载第一页数据
      await this.loadPageData(1);
    } catch (error) {
      console.error('刷新数据失败', error);
      showToast('刷新数据失败');
      this.setData({ isRefreshing: false });
    } finally {
      // 停止微信自带的下拉刷新动画
      wx.stopPullDownRefresh();
    }
  },

  // 加载更多
  async onLoadMore() {
    if (this.data.isLoadingMore || !this.data.hasMoreData) return;
    
    this.setData({ isLoadingMore: true });
    
    // 加载下一页数据
    const nextPage = this.data.currentPage + 1;
    await this.loadPageData(nextPage);
  },

  // 选择餐次
  async selectMealType(e: any) {
    const type = e.currentTarget.dataset.type;
    
    if (this.data.editMode) {
      try {
        // 编辑模式下检查是否有冲突
        const appointmentsResult = await AppointmentService.getAppointmentList(1, 20, undefined, this.data.date);
        const existingAppointments = appointmentsResult.list;
        const hasConflict = existingAppointments.some(
          (app: Appointment) => app.mealType === type && app.id !== this.data.appointmentId
        );
        
        if (hasConflict) {
          showToast('该餐次已存在预约，请选择其他餐次');
          return;
        }
      } catch (error) {
        console.error('检查餐次冲突失败:', error);
        showToast('网络异常，请重试');
        return;
      }
    }
    
    this.setData({
      selectedMealType: type
    });
  },

  // 按菜品类型筛选
  async filterByType(e: any) {
    const type = e.currentTarget.dataset.type;
    
    // 如果选择的是当前类型且不是空类型，则取消选择
    if (this.data.selectedType === type && type !== '') {
      this.setData({ selectedType: '' });
    } else {
      // 否则设置为新类型
      this.setData({ selectedType: type });
    }
    
    // 重置页码
    this.setData({ currentPage: 1 });
    
    // 重新加载数据
    await this.loadPageData(1);
  },

  // 搜索输入
  onSearchInput(e: any) {
    // 保存输入值
    const searchValue = e.detail.value;
    
    // 设置搜索关键词（不立即触发搜索）
    this.setData({
      searchKeyword: searchValue
    });
    
    // 使用防抖，避免频繁请求
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    
    // 创建新的定时器
    this.searchTimer = setTimeout(() => {
      console.log('搜索防抖结束，开始执行搜索:', searchValue);
      // 重置页码并搜索
      this.setData({ currentPage: 1 }, () => {
        this.loadPageData(1);
      });
    }, 500);
  },

  // 清除筛选条件
  async clearFilters() {
    this.setData({
      selectedType: '',
      searchKeyword: '',
      currentPage: 1
    });

    await this.loadPageData(1);
  },

  // 监听滚动事件
  onScroll(e: any) {
    const { scrollTop, scrollHeight } = e.detail;
    const query = wx.createSelectorQuery();
    
    query.select('.scroll-content').boundingClientRect(rect => {
      if (rect) {
        const viewportHeight = rect.height;
        // 判断是否接近底部（距离底部20px以内）
        const isNearBottom = scrollTop + viewportHeight >= scrollHeight - 120;
        
        // 只有当滚动状态改变时才更新
        if (this.data.isNearBottom !== isNearBottom) {
          this.setData({
            lastScrollTop: scrollTop,
            isNearBottom
          }, () => {
            // 如果滚动到底部且有选中的菜品，更新布局
            if (isNearBottom && this.data.selectedCount > 0) {
              this.updateLayoutHeight();
            }
          });
        }
      }
    }).exec();
  },

  // 切换菜品选择状态
  toggleSelectDish(e: any) {
    const dishId = e.currentTarget.dataset.id;
    const { selectedDishes } = this.data;
    
    // 创建新的选中状态对象
    const newSelectedDishes = { ...selectedDishes };
    
    if (selectedDishes[dishId]) {
      // 如果已经选中，则移除
      delete newSelectedDishes[dishId];
    } else {
      // 如果未选中，则添加
      newSelectedDishes[dishId] = true;
    }
    
    const selectedCount = Object.keys(newSelectedDishes).length;
    
    // 更新选中状态
    this.setData({
      selectedDishes: newSelectedDishes,
      selectedCount
    }, () => {
      // 如果选择了超过 10 个菜品，提示用户
      if (selectedCount > 10) {
        showToast('已选择较多菜品，请注意合理安排用餐');
      }

      // 只有在底部时才更新布局高度
      if (this.data.isNearBottom) {
        this.updateLayoutHeight();
      }
    });
  },

  // 取消预约
  cancel() {
    // 如果有修改，询问用户是否放弃
    if (this.data.selectedCount > 0) {
      wx.showModal({
        title: '提示',
        content: '确定放弃当前选择吗？',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        }
      });
    } else {
      wx.navigateBack();
    }
  },

  // 保存预约
  async saveAppointment() {
    const { date, selectedMealType, selectedDishes, editMode, appointmentId } = this.data;
    
    // 获取选中的菜品ID列表
    const selectedDishIds = Object.keys(selectedDishes);
    
    // 验证是否选择了菜品
    if (selectedDishIds.length === 0) {
      showError('请至少选择一个菜品');
      return;
    }
    
    showLoading('保存中...');
    
    try {
      if (editMode) {
        // 更新预约
        await AppointmentService.updateAppointment({
          id: appointmentId,
          date,
          mealType: selectedMealType,
          dishes: selectedDishIds
        });
        
        hideLoading();
        showSuccess('预约更新成功');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        // 检查是否已存在同一天同一餐次的预约
        const appointmentsResult = await AppointmentService.getAppointmentList(1, 20, undefined, date);
        const existingAppointments = appointmentsResult.list;
        const hasConflict = existingAppointments.some(
          (app: Appointment) => app.mealType === selectedMealType
        );
        
        if (hasConflict) {
          hideLoading();
          showError('该餐次已存在预约，请编辑或删除已有预约');
          return;
        }
        
        // 创建新预约
        const appointment: Partial<Appointment> = {
          date,
          mealType: selectedMealType,
          dishes: selectedDishIds
        };
        
        await AppointmentService.createAppointment(appointment);
        hideLoading();
        showSuccess('预约成功');
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } catch (error) {
      hideLoading();
      console.error('保存预约失败', error);
      showError('保存预约失败，请重试');
    }
  },
  
  // 清空所有选择
  clearAllSelection() {
    if (this.data.selectedCount === 0) {
      return;
    }
    
    wx.showModal({
      title: '提示',
      content: '确定清空所有已选菜品吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            selectedDishes: {},
            selectedCount: 0
          }, () => {
            // 在清空选择后重新计算布局高度
            this.updateLayoutHeight();
          });
        }
      }
    });
  },
  
  // 页面分享功能
  onShareAppMessage() {
    return {
      title: '家庭菜单预约 - 让美食规划更简单',
      path: '/pages/index/index'
    };
  }
}); 