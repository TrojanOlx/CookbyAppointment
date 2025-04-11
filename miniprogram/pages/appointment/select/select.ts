import { Dish, MealType, Appointment } from '../../../utils/model';
import { dishService, appointmentService, generateId } from '../../../utils/storage';
import { formatDate, showError, showSuccess } from '../../../utils/util';

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
    appointmentId: '' // 编辑的预约ID
  },

  onLoad(options) {
    // 获取所有菜品
    const dishes = dishService.getAllDishes();
    
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
          appointmentId: options.id
        });
        
        wx.setNavigationBarTitle({
          title: '编辑预约'
        });
      }
    } else if (options.date) {
      // 新建模式，设置日期
      this.setData({
        date: options.date,
        dishes,
        filteredDishes: dishes
      });
    }

    this.applyFilters();
  },

  // 选择餐次
  selectMealType(e: any) {
    const type = e.currentTarget.dataset.type;
    
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
      filtered = filtered.filter(dish => dish.name.includes(searchKeyword));
    }
    
    this.setData({
      filteredDishes: filtered
    });
  },

  // 切换菜品选择状态
  toggleSelectDish(e: any) {
    const dishId = e.currentTarget.dataset.id;
    const { selectedDishes } = this.data;
    
    const index = selectedDishes.indexOf(dishId);
    if (index > -1) {
      // 如果已经选中，则移除
      selectedDishes.splice(index, 1);
    } else {
      // 如果未选中，则添加
      selectedDishes.push(dishId);
    }
    
    this.setData({
      selectedDishes
    });
  },

  // 取消预约
  cancel() {
    wx.navigateBack();
  },

  // 保存预约
  saveAppointment() {
    const { date, selectedMealType, selectedDishes, editMode, appointmentId } = this.data;
    
    // 验证是否选择了菜品
    if (selectedDishes.length === 0) {
      showError('请至少选择一个菜品');
      return;
    }
    
    if (editMode) {
      // 更新预约
      const success = appointmentService.updateAppointment({
        id: appointmentId,
        date,
        mealType: selectedMealType,
        dishes: selectedDishes,
        createTime: Date.now()
      });
      
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
      showSuccess('预约成功');
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  }
}); 