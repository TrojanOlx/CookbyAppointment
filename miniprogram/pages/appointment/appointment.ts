import { AppointmentStatus, MealType } from '../../models/appointment';
import { Dish } from '../../models/dish';
import { AppointmentService } from '../../services/appointmentService';
import { getCurrentDate, showConfirm, showSuccess, showLoading, hideLoading, showToast } from '../../utils/util';
// 引入wx-calendar和农历插件
const { WxCalendar } = require('@lspriv/wx-calendar/lib');
const { LunarPlugin } = require('@lspriv/wc-plugin-lunar');

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
  status: AppointmentStatus;
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
    firstDay: '', // 日历初始化时选中的第一天
    lastDay: '' // 日历初始化时选中的最后一天
  },

  onLoad() {
    // 初始化选择今天的日期
    const today = getCurrentDate(); // 返回格式: YYYY-MM-DD

    // 设置初始日期
    this.setData({
      selectedDate: today
    });

    console.log('初始化选择日期:', today);
    this.setSafeArea();
  },

  onShow() {
    console.log('页面显示');
    // 加载当前选中日期的预约
    if (this.data.selectedDate) {
      this.loadAppointments();
    } else {
      // 如果没有选中日期，默认加载今天的预约
      const today = getCurrentDate();
      this.setData({ selectedDate: today }, () => {
        this.loadAppointments();
      });
    }

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
  async updateCalendarMarks(firstDay: string, lastDay: string) {
    console.log('更新日历标记');
    try {
      showLoading('加载数据中');
      this.setData({ isLoading: true });
      // 获取所有预约
      const result = await AppointmentService.getAppointmentList(
        1,
        100,
        undefined,
        firstDay,
        lastDay
      );
      const appointments = result.list;

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

      // 生成标记数据 - 使用wx-calendar需要的格式
      const marks: any[] = [];

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

          // 计算预约的餐次数量
          const mealCount = (meals.breakfast ? 1 : 0) +
            (meals.lunch ? 1 : 0) +
            (meals.dinner ? 1 : 0);

          // 如果有多个餐次预约，显示"预"
          if (mealCount > 1) {
            marks.push({
              year,
              month,
              day,
              type: 'corner',
              color: '#ffffff',
              bgColor: '#4CAF50',
              text: '预'
            });
          }
          // 如果只有一个餐次预约，显示相应的餐次标记
          else {
            if (meals.breakfast) {
              marks.push({
                year,
                month,
                day,
                type: 'dot',
                color: '#ff9800'  // 早餐用橙色标记
              });
            } else if (meals.lunch) {
              marks.push({
                year,
                month,
                day,
                type: 'dot',
                color: '#2196f3'  // 午餐用蓝色标记
              });
            } else if (meals.dinner) {
              marks.push({
                year,
                month,
                day,
                type: 'dot',
                color: '#9c27b0'  // 晚餐用紫色标记
              });
            }
          }
        } catch (error) {
          console.error(`处理日期标记时出错 ${dateKey}:`, error);
        }
      }

      // 更新日历标记
      this.setData({
        markedDates: marks,
        isLoading: false
      });

      hideLoading();
    } catch (error) {
      console.error('更新日历标记失败:', error);
      this.setData({ isLoading: false });
      hideLoading();
      showToast('加载数据失败');
    }
  },

  // 加载预约
  async loadAppointments() {
    console.log('加载预约数据:', this.data.selectedDate);
    if (!this.data.selectedDate) {
      return;
    }

    try {
      showLoading('加载中');
      this.setData({ isLoading: true });

      // 调用API获取当天预约
      const result = await AppointmentService.getAppointmentListByDate(this.data.selectedDate);
      console.log('预约数据:', result);

      // 处理数据
      const appointments = result.list.map((item: any) => ({
        id: item.id,
        mealType: item.mealType,
        dishList: item.dishes || [],
        status: item.status || '待确认'
      }));

      // 根据餐次顺序排序
      const mealTypeOrder = {
        [MealType.Breakfast]: 1,
        [MealType.Lunch]: 2,
        [MealType.Dinner]: 3
      };

      appointments.sort((a: DisplayAppointment, b: DisplayAppointment) => {
        return mealTypeOrder[a.mealType as MealType] - mealTypeOrder[b.mealType as MealType];
      });

      // 更新页面数据
      this.setData({
        todayAppointments: appointments,
        isLoading: false
      });

      hideLoading();
    } catch (error) {
      console.error('加载预约数据失败:', error);
      this.setData({ isLoading: false });
      hideLoading();
      showToast('加载预约失败');
    }
  },

  // 日历视图变化事件
  onViewChange(e: any) {
    console.log('视图变化:', e.detail);
    // 监听日历视图变化
  },

  // 日历选择月份变化事件
  onCalendarChange(e: any) {
    console.log('日历变化事件:', e.detail);
    const { range } = e.detail;
    
    // 确保range存在且包含起止日期
    if (range && range.length >= 2) {
      const startYear = range[0].year;
      const startMonth = range[0].month;
      const startDay = range[0].day;
      
      const endYear = range[1].year;
      const endMonth = range[1].month;
      const endDay = range[1].day;
      
      // 格式化为YYYY-MM-DD
      const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      
      console.log('日历范围更新:', startDate, '到', endDate);
      
      // 存储当前查看的日期范围
      this.setData({
        firstDay: startDate,
        lastDay: endDate
      });
      
      // 更新日历标记
      this.updateCalendarMarks(startDate, endDate);
    }
  },

  // 日历选择日期事件
  onCalendarSelect(e: any) {
    console.log('日历选择事件:', e.detail);
    const { value } = e.detail;
    
    if (value) {
      const { year, month, day } = value;
      
      // 格式化选中的日期
      const month2Digits = String(month).padStart(2, '0');
      const day2Digits = String(day).padStart(2, '0');
      const selectedDate = `${year}-${month2Digits}-${day2Digits}`;
      
      console.log('选中日期:', selectedDate);
      
      // 设置日期显示文本
      const today = getCurrentDate();
      let dateDisplay = '';
      
      if (selectedDate === today) {
        dateDisplay = '今日';
      } else {
        dateDisplay = `${month}月${day}日`;
      }
      
      // 更新数据
      this.setData({
        selectedDate,
        selectedDateDisplay: dateDisplay
      });
      
      // 加载当天预约
      this.loadAppointments();
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
          this.updateCalendarMarks(this.data.firstDay, this.data.lastDay);
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
    console.log('日历加载完成完整数据:', e);

    // 从事件中获取当前视图信息
    const { view, checked, range } = e.detail;

    if (view) {
      console.log(`日历初始化视图: ${view}`);
    }

    const firstDay = `${range[0].year}-${String(range[0].month).padStart(2, '0')}-${String(range[0].day).padStart(2, '0')}`;
    const lastDay = `${range[1].year}-${String(range[1].month).padStart(2, '0')}-${String(range[1].day).padStart(2, '0')}`;

    console.log('日历加载数据', firstDay, lastDay);
    this.setData({
      firstDay,
      lastDay
    });
    console.log('日历加载数据today:', checked.today);

    if(checked.today){
      console.log('选中今日');
      // 从 checked 中获取年月日
      const { year, month, day } = e.detail.checked;
      const month2Digits = String(month).padStart(2, '0');
      const day2Digits = String(day).padStart(2, '0');
      const selectedDate = `${year}-${month2Digits}-${day2Digits}`;
      this.setData({
        selectedDate: selectedDate
      });
      this.loadAppointments();
    }

    // 日历加载完成后，确保标记已更新
    this.updateCalendarMarks(firstDay, lastDay);
  },

  // 前往评价页面
  goToReview(e: any) {
    const appointmentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/review/review?appointmentId=${appointmentId}`
    });
  }
});