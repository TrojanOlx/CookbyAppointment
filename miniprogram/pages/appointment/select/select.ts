import { Dish, MealType, Appointment } from '../../../utils/model';
import { dishService, appointmentService, generateId } from '../../../utils/storage';
import { formatDate, showError, showSuccess, showToast } from '../../../utils/util';

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
  },

  onLoad(options) {
    this.setData({
      isLoading: true
    });
    
    // 获取所有菜品
    try {
      const dishes = dishService.getAllDishes();
      
      // 按创建时间排序，最新的排在前面
      dishes.sort((a, b) => b.createTime - a.createTime);
      
      if (options.id) {
        // 编辑模式，加载预约数据
        const appointment = appointmentService.getAppointmentById(options.id);
        
        if (appointment) {
          // 将选中的菜品ID数组转换为映射对象
          const selectedDishes = appointment.dishes.reduce((acc, id) => {
            acc[id] = true;
            return acc;
          }, {} as Record<string, boolean>);

          this.setData({
            date: appointment.date,
            selectedMealType: appointment.mealType,
            selectedDishes,
            dishes,
            filteredTotal: dishes.length,
            editMode: true,
            appointmentId: options.id,
            selectedCount: appointment.dishes.length
          });
          
          wx.setNavigationBarTitle({
            title: '编辑预约'
          });
        } else {
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
          dishes,
          filteredTotal: dishes.length,
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
      this.loadPageData(1);
    } catch (error) {
      console.error('加载数据失败', error);
      showError('加载数据失败');
    } finally {
      this.setData({
        isLoading: false
      });
    }

    // 计算固定顶部区域的高度
    this.calculateHeaderHeight();
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
  loadPageData(page: number) {
    const { dishes, selectedType, searchKeyword } = this.data;
    let filtered = [...dishes];
    
    // 按类型筛选
    if (selectedType) {
      filtered = filtered.filter(dish => dish.type === selectedType);
    }
    
    // 按关键词搜索
    if (searchKeyword) {
      filtered = filtered.filter(dish => 
        dish.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        dish.ingredients.some(ing => ing.name.toLowerCase().includes(searchKeyword.toLowerCase()))
      );
    }
    
    // 记录筛选后的总数量
    const filteredTotal = filtered.length;
    
    // 分页截取
    const start = (page - 1) * PAGE_SIZE;
    const end = page * PAGE_SIZE;
    const pageData = filtered.slice(start, end);
    
    // 是否还有更多数据
    const hasMoreData = end < filteredTotal;
    
    // 更新数据
    if (page === 1) {
      // 第一页直接替换
      this.setData({
        filteredDishes: pageData,
        currentPage: page,
        hasMoreData,
        filteredTotal
      });
    } else {
      // 追加到现有数据
      this.setData({
        filteredDishes: [...this.data.filteredDishes, ...pageData],
        currentPage: page,
        hasMoreData
      });
    }
  },

  // 下拉刷新
  onRefresh() {
    if (this.data.isRefreshing) return;
    
    this.setData({
      isRefreshing: true
    });
    
    try {
      // 重新获取菜品数据
      const dishes = dishService.getAllDishes();
      dishes.sort((a, b) => b.createTime - a.createTime);
      
      this.setData({
        dishes,
        currentPage: 1
      });
      
      // 重新加载第一页
      this.loadPageData(1);
      
      showToast('刷新成功');
    } catch (error) {
      console.error('刷新失败', error);
      showError('刷新失败');
    } finally {
      setTimeout(() => {
        this.setData({
          isRefreshing: false
        });
      }, 800); // 稍微延迟停止刷新状态，以便用户看到刷新效果
    }
  },

  // 加载更多
  onLoadMore() {
    if (this.data.isLoadingMore || !this.data.hasMoreData) return;
    
    this.setData({
      isLoadingMore: true
    });
    
    try {
      const nextPage = this.data.currentPage + 1;
      this.loadPageData(nextPage);
    } catch (error) {
      console.error('加载更多失败', error);
    } finally {
      setTimeout(() => {
        this.setData({
          isLoadingMore: false
        });
      }, 500);
    }
  },

  // 选择餐次
  selectMealType(e: any) {
    const type = e.currentTarget.dataset.type;
    
    if (this.data.editMode) {
      // 编辑模式下检查是否有冲突
      const existingAppointments = appointmentService.getAppointmentByDate(this.data.date);
      const hasConflict = existingAppointments.some(
        app => app.mealType === type && app.id !== this.data.appointmentId
      );
      
      if (hasConflict) {
        showToast('该餐次已存在预约，请选择其他餐次');
        return;
      }
    }
    
    this.setData({
      selectedMealType: type
    });
  },

  // 按菜品类型筛选
  filterByType(e: any) {
    const type = e.currentTarget.dataset.type;
    
    this.setData({
      selectedType: type,
      currentPage: 1
    });

    this.loadPageData(1);
  },

  // 搜索输入
  onSearchInput(e: any) {
    this.setData({
      searchKeyword: e.detail.value,
      currentPage: 1
    });
    
    this.loadPageData(1);
  },

  // 清除筛选条件
  clearFilters() {
    this.setData({
      selectedType: '',
      searchKeyword: '',
      currentPage: 1
    });

    this.loadPageData(1);
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
  saveAppointment() {
    const { date, selectedMealType, selectedDishes, editMode, appointmentId } = this.data;
    
    // 获取选中的菜品ID列表
    const selectedDishIds = Object.keys(selectedDishes);
    
    // 验证是否选择了菜品
    if (selectedDishIds.length === 0) {
      showError('请至少选择一个菜品');
      return;
    }
    
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    try {
      if (editMode) {
        // 更新预约
        const success = appointmentService.updateAppointment({
          id: appointmentId,
          date,
          mealType: selectedMealType,
          dishes: selectedDishIds,
          createTime: Date.now()
        });
        
        wx.hideLoading();
        
        if (success) {
          showSuccess('预约更新成功');
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          showError('预约更新失败');
        }
      } else {
        // 检查是否已存在同一天同一餐次的预约
        const existingAppointments = appointmentService.getAppointmentByDate(date);
        const hasConflict = existingAppointments.some(
          app => app.mealType === selectedMealType
        );
        
        if (hasConflict) {
          wx.hideLoading();
          showError('该餐次已存在预约，请编辑或删除已有预约');
          return;
        }
        
        // 创建新预约
        const appointment: Appointment = {
          id: generateId(),
          date,
          mealType: selectedMealType,
          dishes: selectedDishIds,
          createTime: Date.now()
        };
        
        appointmentService.addAppointment(appointment);
        wx.hideLoading();
        showSuccess('预约成功');
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } catch (error) {
      wx.hideLoading();
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