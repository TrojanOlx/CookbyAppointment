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
              text: '预',
              style: { color: '#4CAF50' } // 绿色
            });
          } else {
            // 只有一个餐次预约时，显示具体是哪一餐
            if (meals.breakfast) {
              marks.push({
                year,
                month,
                day,
                type: 'corner',
                text: '早',
                style: { color: '#2196F3' } // 蓝色
              });
            } else if (meals.lunch) {
              marks.push({
                year,
                month,
                day,
                type: 'corner',
                text: '午',
                style: { color: '#FF9800' } // 橙色
              });
            } else if (meals.dinner) {
              marks.push({
                year,
                month,
                day,
                type: 'corner',
                text: '晚',
                style: { color: '#9C27B0' } // 紫色
              });
            }
          }
        } catch (error) {
          console.error(`处理日期标记时出错: ${dateKey}`, error);
        }
      }

      console.log('设置日历标记:', marks);
      this.setData({ markedDates: marks, isLoading: false });
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
    if (!this.data.selectedDate) {
      console.warn('没有选择日期');
      return;
    }

    try {
      showLoading('加载预约中');
      this.setData({ isLoading: true });

      // 使用新的getAppointmentListByDate方法获取预约数据
      const result = await AppointmentService.getAppointmentListByDate(this.data.selectedDate);

      // 按餐次分类预约
      const appointments = result.list;
      const displayAppointments: DisplayAppointment[] = [];
      // 遍历所有预约
      for (const appointment of appointments) {
        displayAppointments.push({
          id: appointment.id,
          mealType: appointment.mealType,
          dishList: (appointment.dishes || []) as Dish[],
          status: appointment.status || AppointmentStatus.Pending
        });
      }

      // 按餐次排序：早餐 -> 午餐 -> 晚餐
      displayAppointments.sort((a, b) => {
        const mealOrder = {
          [MealType.Breakfast]: 1,
          [MealType.Lunch]: 2,
          [MealType.Dinner]: 3
        };
        return mealOrder[a.mealType as MealType] - mealOrder[b.mealType as MealType];
      });

      console.log('加载到的预约:', displayAppointments);
      this.setData({
        todayAppointments: displayAppointments,
        isLoading: false
      });
      hideLoading();
    } catch (error) {
      console.error('加载预约数据时出错:', error);
      this.setData({ isLoading: false });
      hideLoading();
      showToast('加载预约失败');
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

      const { range, checked } = e.detail;
      const firstDay = `${range[0].year}-${String(range[0].month).padStart(2, '0')}-${String(range[0].day).padStart(2, '0')}`;
      const lastDay = `${range[1].year}-${String(range[1].month).padStart(2, '0')}-${String(range[1].day).padStart(2, '0')}`;

      // 如果选中日期发生变化，则更新选中的日期
      if (firstDay !== this.data.firstDay || lastDay !== this.data.lastDay) {
        console.log('日历变化重新请求标记:', e.detail);
        this.setData({
          firstDay,
          lastDay
        });
        this.updateCalendarMarks(firstDay, lastDay);
      }

      // 如果选中今日，则更新选中的日期
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

    } catch (error) {
      console.error('处理日历变化事件时出错:', error);
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

    const confirmed = await showConfirm('确认取消', '确定要取消这个预约吗？');
    if (confirmed) {
      try {
        showLoading('取消中');
        this.setData({ isLoading: true });
        const result = await AppointmentService.cancelAppointment(id, '用户取消预约');
        if (result.success) {
          hideLoading();
          this.setData({ isLoading: false });
          showSuccess('取消成功');

          // 重新加载数据
          this.updateCalendarMarks(this.data.firstDay, this.data.lastDay);
          this.loadAppointments();
        } else {
          throw new Error('取消失败');
        }
      } catch (error) {
        hideLoading();
        this.setData({ isLoading: false });
        console.error('取消预约失败:', error);
        showToast('取消预约失败');
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
  },

  // 重新预约（恢复已取消的预约）
  async reactivateAppointment(e: any) {
    const id = e.currentTarget.dataset.id;

    const confirmed = await showConfirm('确认重新预约', '确定要恢复这个已取消的预约吗？');
    if (confirmed) {
      try {
        showLoading('处理中');
        this.setData({ isLoading: true });
        
        const result = await AppointmentService.reactivateAppointment(id);
        
        if (result.success) {
          hideLoading();
          this.setData({ isLoading: false });
          showSuccess('重新预约成功');

          // 重新加载数据
          this.updateCalendarMarks(this.data.firstDay, this.data.lastDay);
          this.loadAppointments();
        } else {
          throw new Error('重新预约失败');
        }
      } catch (error) {
        hideLoading();
        this.setData({ isLoading: false });
        console.error('重新预约失败:', error);
        showToast('重新预约失败');
      }
    }
  }
});