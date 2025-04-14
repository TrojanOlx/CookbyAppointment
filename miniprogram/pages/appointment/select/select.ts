import { Dish, MealType, Appointment } from '../../../utils/model';
import { dishService, appointmentService, generateId } from '../../../utils/storage';
import { formatDate, showError, showSuccess, showToast } from '../../../utils/util';

Page({
  data: {
    date: '', // YYYY-MM-DD 格式的日期
    dishes: [] as Dish[], // 所有菜品列表
    filteredDishes: [] as Dish[], // 过滤后的菜品列表
    selectedDishes: [] as string[], // 已选择的菜品ID列表
    selectedType: '', // 当前选择的菜品类型
    selectedMealType: MealType.Lunch, // 当前选择的餐次
    searchKeyword: '', // 搜索关键词
    editMode: false, // 是否是编辑模式
    appointmentId: '', // 编辑的预约ID
    isLoading: true, // 加载状态
    selectedCount: 0 // 已选择的菜品数量
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
          this.setData({
            date: appointment.date,
            selectedMealType: appointment.mealType,
            selectedDishes: [...appointment.dishes],
            dishes,
            filteredDishes: dishes,
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
          filteredDishes: dishes
        });
      } else {
        showError('参数错误');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }
      
      this.applyFilters();
    } catch (error) {
      console.error('加载数据失败', error);
      showError('加载数据失败');
    } finally {
      this.setData({
        isLoading: false
      });
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
      selectedType: type
    });

    this.applyFilters();
  },

  // 搜索输入
  onSearchInput(e: any) {
    this.setData({
      searchKeyword: e.detail.value
    });
    
    this.applyFilters();
  },

  // 应用筛选条件
  applyFilters() {
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
    
    this.setData({
      filteredDishes: filtered
    });
  },

  // 清除筛选条件
  clearFilters() {
    this.setData({
      selectedType: '',
      searchKeyword: '',
      filteredDishes: this.data.dishes
    });
  },

  // 切换菜品选择状态
  toggleSelectDish(e: any) {
    const dishId = e.currentTarget.dataset.id;
    const { selectedDishes } = this.data;
    
    const index = selectedDishes.indexOf(dishId);
    let newSelectedDishes = [...selectedDishes];
    
    if (index > -1) {
      // 如果已经选中，则移除
      newSelectedDishes.splice(index, 1);
    } else {
      // 如果未选中，则添加
      newSelectedDishes.push(dishId);
    }
    
    this.setData({
      selectedDishes: newSelectedDishes,
      selectedCount: newSelectedDishes.length
    });
    
    // 如果选择了超过 10 个菜品，提示用户
    if (newSelectedDishes.length > 10) {
      showToast('已选择较多菜品，请注意合理安排用餐');
    }
  },

  // 取消预约
  cancel() {
    // 如果有修改，询问用户是否放弃
    if (this.data.selectedDishes.length > 0) {
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
    
    // 验证是否选择了菜品
    if (selectedDishes.length === 0) {
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
          dishes: selectedDishes,
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
          dishes: selectedDishes,
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
    if (this.data.selectedDishes.length === 0) {
      return;
    }
    
    wx.showModal({
      title: '提示',
      content: '确定清空所有已选菜品吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            selectedDishes: [],
            selectedCount: 0
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