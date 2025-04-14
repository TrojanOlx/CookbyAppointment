import { Appointment, Dish, MealType } from '../../utils/model';
import { appointmentService, dishService } from '../../utils/storage';
import { formatDate, getCurrentDate, getDaysInMonth, showConfirm, showSuccess } from '../../utils/util';
// 引入wx-calendar和农历插件
import { WxCalendar } from '@lspriv/wx-calendar/lib';
import * as LunarPlugin from '@lspriv/wc-plugin-lunar';

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
  },

  onLoad() {
    // 初始化选择今天的日期
    const today = getCurrentDate(); // 返回格式: YYYY-MM-DD
    
    // 设置初始日期
    this.setData({
      selectedDate: today
    });
    
    console.log('初始化选择日期:', today);
    
    this.updateCalendarMarks();
    this.loadAppointments();
  },

  onShow() {
    // 每次显示页面时重新加载预约数据
    this.updateCalendarMarks();
    this.loadAppointments();
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  // 更新日历标记
  updateCalendarMarks() {
    // 获取所有预约
    const appointments = appointmentService.getAllAppointments();
    
    // 创建日期到预约类型的映射
    const dateToMeals = new Map<string, {
      breakfast: boolean;
      lunch: boolean;
      dinner: boolean;
    }>();
    
    for (const appointment of appointments) {
      const [year, month, day] = appointment.date.split('-').map(Number);
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
      const [year, month, day] = dateKey.split('-').map(Number);
      
      // 构建标记 key
      const markKey = `${year}_${month}_${day}`;
      
      // 为每个餐次添加不同颜色的点
      if (meals.breakfast) {
        markedDates.push({
          key: markKey,
          type: 'dot',
          color: '#2196F3', // 早餐 - 蓝色
          bgColor: 'transparent'
        });
      }
      
      if (meals.lunch) {
        markedDates.push({
          key: markKey,
          type: 'dot',
          color: '#FF9800', // 午餐 - 橙色
          bgColor: 'transparent'
        });
      }
      
      if (meals.dinner) {
        markedDates.push({
          key: markKey,
          type: 'dot',
          color: '#9C27B0', // 晚餐 - 紫色
          bgColor: 'transparent'
        });
      }
    }
    
    this.setData({ markedDates });
  },

  // 加载选定日期的预约
  loadAppointments() {
    const { selectedDate } = this.data;
    if (!selectedDate) return;

    // 获取当天所有预约
    const dateAppointments = appointmentService.getAppointmentByDate(selectedDate);
    
    // 转换为展示数据
    const todayAppointments: DisplayAppointment[] = [];
    
    for (const appointment of dateAppointments) {
      const dishList: Dish[] = [];
      for (const dishId of appointment.dishes) {
        const dish = dishService.getDishById(dishId);
        if (dish) {
          dishList.push(dish);
        }
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
      const date = new Date(selectedDate);
      selectedDateDisplay = `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    this.setData({
      todayAppointments,
      selectedDateDisplay
    });
  },

  // 日历视图变化事件
  onViewChange(e: any) {
    const { view } = e.detail;
    console.log(`视图切换到: ${view}`);
  },

  // 日历变化事件（月份切换等）
  onCalendarChange(e: any) {
    console.log('日历变化事件完整数据:', e.detail);
    
    // 根据实际数据结构获取当前年月
    let currentYear, currentMonth;
    
    if (e.detail.current) {
      currentYear = e.detail.current.year;
      currentMonth = e.detail.current.month;
    } else if (e.detail.year && e.detail.month) {
      currentYear = e.detail.year;
      currentMonth = e.detail.month;
    }
    
    if (currentYear && currentMonth) {
      console.log(`日历切换到 ${currentYear}年${currentMonth}月`);
    }
    
    // 更新标记
    this.updateCalendarMarks();
  },

  // 日历选择日期事件处理
  onCalendarSelect(e: any) {
    console.log('日历点击事件完整数据:', e.detail);
    
    // 新版 wx-calendar 返回的格式是 e.detail.checked
    if (!e.detail.checked) {
      console.error('日历点击事件未返回checked数据', e.detail);
      return;
    }
    
    // 从 checked 中获取年月日
    const { year, month, day } = e.detail.checked;
    
    if (!year || !month || !day) {
      console.error('日历点击事件中的checked数据不完整', e.detail.checked);
      return;
    }
    
    // 格式化选中的日期为 YYYY-MM-DD 格式
    const month2Digits = String(month).padStart(2, '0');
    const day2Digits = String(day).padStart(2, '0');
    const selectedDate = `${year}-${month2Digits}-${day2Digits}`;
    
    console.log('选中日期:', selectedDate);
    
    // checked中可能包含农历信息
    const lunar = e.detail.checked.lunar;
    if (lunar) {
      console.log('农历信息:', lunar);
    }
    
    this.setData({
      selectedDate
    });
    
    this.loadAppointments();
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
      appointmentService.deleteAppointment(id);
      showSuccess('删除成功');
      
      // 重新加载数据
      this.updateCalendarMarks();
      this.loadAppointments();
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
    
    if (current && current.year && current.month) {
      console.log(`日历初始化年月: ${current.year}年${current.month}月`);
    }
    
    // 日历加载完成后，确保标记已更新
    this.updateCalendarMarks();
  },
}); 