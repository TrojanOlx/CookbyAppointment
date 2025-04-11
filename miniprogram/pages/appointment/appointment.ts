import { Appointment, Dish, MealType } from '../../utils/model';
import { appointmentService, dishService } from '../../utils/storage';
import { formatDate, getCurrentDate, getDaysInMonth, showConfirm, showSuccess } from '../../utils/util';

interface CalendarDay {
  date: string;
  day: number;
  currentMonth: boolean;
  today: boolean;
  hasAppointment: boolean;
  meals: {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
  };
}

interface DisplayAppointment {
  id: string;
  mealType: string;
  dishList: Dish[];
}

Page({
  data: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    days: [] as CalendarDay[],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    selectedDate: '', // 选中的日期
    selectedDateDisplay: '今日', // 选中的日期显示文本
    todayAppointments: [] as DisplayAppointment[]
  },

  onLoad() {
    // 初始化选择今天的日期
    const today = getCurrentDate();
    this.setData({
      selectedDate: today
    });
    this.generateCalendar();
    this.loadAppointments();
  },

  onShow() {
    // 每次显示页面时重新加载预约数据
    this.generateCalendar();
    this.loadAppointments();
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  // 生成日历数据
  generateCalendar() {
    const { year, month } = this.data;
    const today = getCurrentDate();
    const days: CalendarDay[] = [];

    // 获取当月第一天是星期几
    const firstDay = new Date(year, month, 1).getDay();
    
    // 获取当月的天数
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    // 获取上个月的天数
    const daysInPrevMonth = getDaysInMonth(year, month);

    // 添加上个月的日期
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date,
        day,
        currentMonth: false,
        today: date === today,
        hasAppointment: false,
        meals: {
          breakfast: false,
          lunch: false,
          dinner: false
        }
      });
    }

    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        date,
        day: i,
        currentMonth: true,
        today: date === today,
        hasAppointment: false,
        meals: {
          breakfast: false,
          lunch: false,
          dinner: false
        }
      });
    }

    // 添加下个月的日期，使总数达到42（6行7列）
    const nextDays = 42 - days.length;
    for (let i = 1; i <= nextDays; i++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const date = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        date,
        day: i,
        currentMonth: false,
        today: date === today,
        hasAppointment: false,
        meals: {
          breakfast: false,
          lunch: false,
          dinner: false
        }
      });
    }

    // 获取所有预约并标记
    const appointments = appointmentService.getAllAppointments();
    for (let i = 0; i < days.length; i++) {
      const dateAppointments = appointments.filter(app => app.date === days[i].date);
      if (dateAppointments.length > 0) {
        days[i].hasAppointment = true;
        
        // 标记各餐次是否有预约
        for (const app of dateAppointments) {
          if (app.mealType === MealType.Breakfast) {
            days[i].meals.breakfast = true;
          } else if (app.mealType === MealType.Lunch) {
            days[i].meals.lunch = true;
          } else if (app.mealType === MealType.Dinner) {
            days[i].meals.dinner = true;
          }
        }
      }
    }

    this.setData({ days });
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

  // 切换到上一个月
  prevMonth() {
    const { year, month } = this.data;
    let newYear = year;
    let newMonth = month - 1;
    
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }

    this.setData({
      year: newYear,
      month: newMonth
    });
    
    this.generateCalendar();
  },

  // 切换到下一个月
  nextMonth() {
    const { year, month } = this.data;
    let newYear = year;
    let newMonth = month + 1;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    this.setData({
      year: newYear,
      month: newMonth
    });
    
    this.generateCalendar();
  },

  // 选择日期
  selectDate(e: any) {
    const date = e.currentTarget.dataset.date;
    this.setData({
      selectedDate: date
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
      url: `./select/select?id=${id}`
    });
  },

  // 删除预约
  async deleteAppointment(e: any) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await showConfirm('确认删除', '确定要删除此预约吗？');
    
    if (confirmed) {
      const success = appointmentService.deleteAppointment(id);
      if (success) {
        showSuccess('删除成功');
        this.generateCalendar();
        this.loadAppointments();
      }
    }
  }
}); 