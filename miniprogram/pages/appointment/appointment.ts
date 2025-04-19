import { MealType, AppointmentStatus, Appointment as AppointmentModel } from '../../models/appointment';
import { Dish } from '../../models/dish';
import { AppointmentService } from '../../services/appointmentService';
import { DishService } from '../../services/dishService';
import { formatDate, getCurrentDate, getDaysInMonth, showConfirm, showSuccess, showLoading, hideLoading, showToast } from '../../utils/util';
// 引入wx-calendar和农历插件
const { WxCalendar } = require('@lspriv/wx-calendar/lib');
const { LunarPlugin, LUNAR_PLUGIN_KEY } = require('@lspriv/wc-plugin-lunar');

// 初始化日历插件
WxCalendar.use(LunarPlugin);

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

interface DisplayAppointment {
  id: string;
  mealType: string;
  dishList: Dish[];
}

interface MarkItem {
  key: string;
  type: 'dot' | 'schedule' | 'corner';
  color?: string;
  bgColor?: string;
  text?: string;
}

Page({
  data: {
    calendarMode: 'month', // 日历视图模式：month, week, schedule
    selectedDate: '', // 选中的日期，形式：YYYY-MM-DD
    markedDates: [] as MarkItem[], // 标记的日期
    selectedDateDisplay: '今日', // 选中的日期显示文本
    todayAppointments: [] as DisplayAppointment[], // 当前选中日期的预约
    plugins: [LunarPlugin],  // 使用农历插件
    safeAreaBottom: 0,
    isLoading: false, // 加载状态
    currentYear: 0,
    currentMonth: 0
  },

  onLoad() {
    // 初始化选择今天的日期
    const today = getCurrentDate(); // 返回格式: YYYY-MM-DD
    const currentDate = new Date();
    
    // 设置初始日期和当前年月
    this.setData({
      selectedDate: today,
      currentYear: currentDate.getFullYear(),
      currentMonth: currentDate.getMonth() + 1
    });

    console.log('初始化选择日期:', today);

    this.updateCalendarMarks();
    this.loadAppointments();
    this.setSafeArea();
  },

  onShow() {
    // 每次显示页面时重新加载预约数据
    this.updateCalendarMarks();
    this.loadAppointments();

    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
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

  // 更新日历标记
  async updateCalendarMarks() {
    try {
      showLoading('加载数据中');
      this.setData({ isLoading: true });
      
      // 只获取当天的预约
      const today = getCurrentDate();
      console.log('只获取今天的预约:', today);
      
      // 获取当天预约
      const result = await AppointmentService.getAppointmentList(1, 200, undefined, today);
      const appointments = result.list.filter(appointment => appointment.date === today);
      
      console.log(`获取当天(${today})预约:`, appointments.length, '条');

      // 创建日期到预约类型的映射
      const dateToMeals = new Map<string, {
        breakfast: boolean;
        lunch: boolean;
        dinner: boolean;
      }>();

      for (const appointment of appointments) {
        // 检查日期是否有效
        if (!appointment.date || typeof appointment.date !== 'string' || !appointment.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.warn('预约中存在无效日期:', appointment);
          continue;
        }

        const [year, month, day] = appointment.date.split('-').map(Number);
        
        // 验证年月日值是否有效
        if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
          console.warn('预约日期格式无效:', appointment.date);
          continue;
        }

        const dateKey = appointment.date;

        // 获取当前日期的预约记录
        if (!dateToMeals.has(dateKey)) {
          dateToMeals.set(dateKey, {
            breakfast: false,
            lunch: false,
            dinner: false
          });
        }

        // 标记该日期相应的餐次
        const meals = dateToMeals.get(dateKey)!;
        if (appointment.mealType === MealType.Breakfast) {
          meals.breakfast = true;
        } else if (appointment.mealType === MealType.Lunch) {
          meals.lunch = true;
        } else if (appointment.mealType === MealType.Dinner) {
          meals.dinner = true;
        }
      }

      // 生成标记数据
      const markedDates: any[] = [];

      // 遍历所有有预约的日期
      for (const [dateKey, meals] of dateToMeals.entries()) {
        try {
          // 分割日期并确保它们是有效数字
          const [yearStr, monthStr, dayStr] = dateKey.split('-');
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10);
          const day = parseInt(dayStr, 10);
          
          // 验证年月日是有效的
          if (isNaN(year) || isNaN(month) || isNaN(day) || 
              year < 1900 || year > 2100 || 
              month < 1 || month > 12 || 
              day < 1 || day > 31) {
            console.warn(`日期值无效: ${dateKey}`);
            continue;
          }

          // 为每个餐次添加不同颜色的点
          if (meals.breakfast) {
            markedDates.push({
              date: { year, month, day },  // 使用date属性而不是key
              type: 'dot',
              color: '#2196F3', // 早餐 - 蓝色
              bgColor: 'transparent'
            });
          }

          if (meals.lunch) {
            markedDates.push({
              date: { year, month, day },  // 使用date属性而不是key
              type: 'dot',
              color: '#FF9800', // 午餐 - 橙色
              bgColor: 'transparent'
            });
          }

          if (meals.dinner) {
            markedDates.push({
              date: { year, month, day },  // 使用date属性而不是key
              type: 'dot',
              color: '#9C27B0', // 晚餐 - 紫色
              bgColor: 'transparent'
            });
          }
        } catch (error) {
          console.error(`处理日期标记时出错: ${dateKey}`, error);
        }
      }

      console.log('设置日历标记:', markedDates);
      this.setData({ markedDates, isLoading: false });
      hideLoading();
    } catch (error) {
      console.error('更新日历标记时出错:', error);
      this.setData({ isLoading: false });
      hideLoading();
      showToast('获取预约数据失败');
    }
  },

  // 加载选定日期的预约
  async loadAppointments() {
    try {
      const { selectedDate } = this.data;
      
      // 验证日期格式
      if (!selectedDate || typeof selectedDate !== 'string' || !selectedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn('选定日期无效:', selectedDate);
        
        // 如果日期无效，使用当前日期
        const today = getCurrentDate();
        this.setData({ selectedDate: today, selectedDateDisplay: '今日', isLoading: false });
        
        console.log('使用今日日期:', today);
        return;
      }

      showLoading('加载预约中');
      this.setData({ isLoading: true });

      // 获取当天所有预约（传入具体日期）
      const result = await AppointmentService.getAppointmentList(1, 20, undefined, selectedDate);
      // 只过滤出当天的预约
      const dateAppointments = result.list.filter(appointment => appointment.date === selectedDate);
      console.log(`获取${selectedDate}的预约:`, dateAppointments.length, '条');

      // 转换为展示数据
      const todayAppointments: DisplayAppointment[] = [];

      for (const appointment of dateAppointments) {
        const dishList: Dish[] = [];
        
        try {
          // 使用getAppointmentDishes获取预约菜品关联
          const appointmentDishes = await AppointmentService.getAppointmentDishes(appointment.id);
          console.log(`预约${appointment.id}的菜品关联:`, appointmentDishes.length, '个');
          
          // 获取每个菜品的详细信息
          for (const appointmentDish of appointmentDishes) {
            try {
              const dish = await DishService.getDishDetail(appointmentDish.dishId);
              if (dish) {
                dishList.push(dish);
              } else {
                console.warn(`未找到菜品: ${appointmentDish.dishId}`);
              }
            } catch (error) {
              console.error(`获取菜品详情失败: ${appointmentDish.dishId}`, error);
            }
          }
        } catch (error) {
          console.error(`获取预约菜品关联失败: ${appointment.id}`, error);
        }

        todayAppointments.push({
          id: appointment.id,
          mealType: appointment.mealType,
          dishList
        });
      }

      // 按餐次排序
      todayAppointments.sort((a, b) => {
        const order = { [MealType.Breakfast]: 1, [MealType.Lunch]: 2, [MealType.Dinner]: 3 };
        return order[a.mealType as MealType] - order[b.mealType as MealType];
      });

      // 格式化选中日期的显示
      let selectedDateDisplay = '今日';
      if (selectedDate !== getCurrentDate()) {
        try {
          const date = new Date(selectedDate);
          
          // 验证日期对象是否有效
          if (isNaN(date.getTime())) {
            console.warn('无法创建有效的日期对象:', selectedDate);
          } else {
            selectedDateDisplay = `${date.getMonth() + 1}月${date.getDate()}日`;
          }
        } catch (error) {
          console.error('格式化日期显示时出错:', error);
        }
      }

      this.setData({
        todayAppointments,
        selectedDateDisplay,
        isLoading: false
      });
      
      hideLoading();
    } catch (error) {
      console.error('加载预约数据时出错:', error);
      
      // 发生错误时，至少确保有一个空列表显示
      this.setData({
        todayAppointments: [],
        selectedDateDisplay: '今日',
        isLoading: false
      });
      
      hideLoading();
      showToast('获取预约数据失败');
    }
  },

  // 日历视图变化事件
  onViewChange(e: any) {
    const { view } = e.detail;
    console.log(`视图切换到: ${view}`);
  },

  // 日历变化事件（月份切换等）
  onCalendarChange(e: any) {
    console.log('日历变化事件完整数据:', e.detail);

    try {
      // 检查事件数据是否存在
      if (!e || !e.detail) {
        console.error('日历变化事件数据无效');
        return;
      }

      // 根据实际数据结构获取当前年月
      let currentYear, currentMonth;

      if (e.detail.current) {
        currentYear = e.detail.current.year;
        currentMonth = e.detail.current.month;
      } else if (e.detail.year && e.detail.month) {
        currentYear = e.detail.year;
        currentMonth = e.detail.month;
      }

      // 验证年月是否有效
      if (currentYear && currentMonth && 
          typeof currentYear === 'number' && typeof currentMonth === 'number' &&
          !isNaN(currentYear) && !isNaN(currentMonth)) {
        console.log(`日历切换到 ${currentYear}年${currentMonth}月`);
        
        // 存储当前显示的年月，供updateCalendarMarks使用
        this.setData({
          currentYear,
          currentMonth
        });
      } else {
        console.warn('日历变化事件中的年月数据无效', e.detail);
      }

      // 更新标记
      this.updateCalendarMarks();
    } catch (error) {
      console.error('处理日历变化事件时出错:', error);
      // 即使出错也尝试更新标记
      this.updateCalendarMarks();
    }
  },

  // 日历选择日期事件处理
  onCalendarSelect(e: any) {
    console.log('日历点击事件完整数据:', e.detail);

    try {
      // 检查事件数据是否存在
      if (!e || !e.detail) {
        console.error('日历点击事件数据无效');
        return;
      }

      // 新版 wx-calendar 返回的格式是 e.detail.checked
      if (!e.detail.checked) {
        console.error('日历点击事件未返回checked数据', e.detail);
        return;
      }

      // 从 checked 中获取年月日
      const { year, month, day } = e.detail.checked;

      // 验证年月日是否有效
      if (!year || !month || !day || 
          typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number' ||
          isNaN(year) || isNaN(month) || isNaN(day)) {
        console.error('日历点击事件中的checked数据不完整或无效', e.detail.checked);
        return;
      }

      // 格式化选中的日期为 YYYY-MM-DD 格式
      const month2Digits = String(month).padStart(2, '0');
      const day2Digits = String(day).padStart(2, '0');
      const selectedDate = `${year}-${month2Digits}-${day2Digits}`;

      console.log('选中日期:', selectedDate);

      // 更新数据并加载该日期的预约
      this.setData({ selectedDate }, () => {
        this.loadAppointments();
      });

      // checked中可能包含农历信息
      const lunar = e.detail.checked.lunar;
      if (lunar) {
        console.log('农历信息:', lunar);
      }
    } catch (error) {
      console.error('处理日历选择事件时出错:', error);
    }
  },

  // 添加预约
  addAppointment() {
    wx.navigateTo({
      url: `./select/select?date=${this.data.selectedDate}`
    });
  },

  // 编辑预约
  editAppointment(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `./select/select?id=${id}&date=${this.data.selectedDate}`
    });
  },

  // 删除预约
  async deleteAppointment(e: any) {
    const id = e.currentTarget.dataset.id;

    const confirmed = await showConfirm('确认删除', '确定要删除这个预约吗？');
    if (confirmed) {
      try {
        showLoading('删除中');
        this.setData({ isLoading: true });
        const result = await AppointmentService.cancelAppointment(id, '用户手动删除');
        if (result.success) {
          hideLoading();
          this.setData({ isLoading: false });
          showSuccess('删除成功');
          
          // 重新加载数据
          this.updateCalendarMarks();
          this.loadAppointments();
        } else {
          throw new Error('删除失败');
        }
      } catch (error) {
        hideLoading();
        this.setData({ isLoading: false });
        console.error('删除预约失败:', error);
        showToast('删除预约失败');
      }
    }
  },

  // 日历加载完成事件
  onCalendarLoad(e: any) {
    console.log('日历加载完成完整数据:', e.detail);

    // 从事件中获取当前视图信息
    const { view, current } = e.detail;

    if (view) {
      console.log(`日历初始化视图: ${view}`);
    }

    // 如果事件中包含年月信息，更新当前年月
    if (current && current.year && current.month) {
      console.log(`日历初始化年月: ${current.year}年${current.month}月`);
      this.setData({
        currentYear: current.year,
        currentMonth: current.month
      });
    }

    // 日历加载完成后，确保标记已更新
    this.updateCalendarMarks();
  },
});