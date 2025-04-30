// 引入数据管理工具和类型定义
import { AdminAppointmentService } from '../../../../services/adminAppointmentService';
import { AppointmentService } from '../../../../services/appointmentService';
import { Appointment } from '../../../../models/appointment';
import { formatDate, getCurrentDate, showLoading, hideLoading, showToast } from '../../../../utils/util';
import { MealType } from '../../../../utils/model';

// 引入wx-calendar和农历插件
const { WxCalendar } = require('@lspriv/wx-calendar/lib');
const { LunarPlugin, LUNAR_PLUGIN_KEY } = require('@lspriv/wc-plugin-lunar');

// 初始化日历插件
WxCalendar.use(LunarPlugin);

// 扩展的管理员预约信息接口，包含用户信息
interface AdminAppointment extends Appointment {
  userName: string;
  userPhone: string;
  userAvatar: string;
  dishes: any[];
}

// 用户预约信息接口
interface UserAppointment {
  userName: string;
  userPhone: string;
  userAvatar: string;
  userId: string;
  isExpanded?: boolean;
  meals: {
    type: string;
    dishes: string[];
    status?: string;
    id?: string;
  }[];
}

// 标记项目接口
interface MarkItem {
  year: number;
  month: number;
  day: number;
  type: 'dot' | 'schedule' | 'corner';
  color?: string;
  bgColor?: string;
  text?: string;
  style?: any;
}

Page({
  data: {
    calendarMode: 'month', // 日历视图模式：month, week, schedule
    selectedDate: '', // 选中的日期，形式：YYYY-MM-DD
    markedDates: [] as MarkItem[], // 标记的日期
    selectedDateDisplay: '今日', // 选中的日期显示文本
    userAppointments: [] as UserAppointment[], // 当前选中日期的用户预约列表
    plugins: [LunarPlugin],  // 使用农历插件
    safeAreaBottom: 0,
    isLoading: false, // 加载状态
    firstDay: '',
    lastDay: ''
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
      this.loadUserAppointments();
    } else {
      // 如果没有选中日期，默认加载今天的预约
      const today = getCurrentDate();
      this.setData({ selectedDate: today }, () => {
        this.loadUserAppointments();
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
  async updateCalendarMarks(firstDay?: string, lastDay?: string) {
    console.log('更新日历标记');
    try {
      showLoading('加载数据中');
      this.setData({ isLoading: true });

      // 如果没有传入日期范围，使用当前设置的范围
      firstDay = firstDay || this.data.firstDay;
      lastDay = lastDay || this.data.lastDay;

      if (!firstDay || !lastDay) {
        console.warn('未提供日期范围，无法更新标记');
        return;
      }

      // 获取所有预约
      const result = await AdminAppointmentService.getAllAppointments(
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
      const marks: MarkItem[] = [];

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

  // 加载用户预约数据
  async loadUserAppointments() {
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

      console.log(`加载${selectedDate}的预约数据`);
      
      // 使用AdminAppointmentService.getDateAppointments获取特定日期的预约
      const result = await AdminAppointmentService.getDateAppointments(1, 50, selectedDate);
      const dateAppointments = result.list;
      console.log('dateAppointments:', dateAppointments);
      
      // 创建用户到餐次的映射
      const userAppointmentMap = new Map<string, UserAppointment>();
      
      // 对预约按用户分组
      for (const appointment of dateAppointments) {
        // 确保有用户信息
        if (!appointment.userId) {
          console.warn('预约缺少用户ID:', appointment);
          continue;
        }
        
        // 用户ID必须存在（前面已经检查）
        const userId = appointment.userId || '';
        
        // 获取或创建用户预约对象
        if (!userAppointmentMap.has(userId)) {
          const user = {
            userName: appointment.userName || '未知用户',
            userPhone: appointment.userPhone || '',
            userAvatar: appointment.userAvatar || '',
            userId: userId,
            meals: []
          } as UserAppointment;
          
          userAppointmentMap.set(userId, user);
        }
        
        const userAppointment = userAppointmentMap.get(userId)!;
        
        // 获取菜品名称列表
        const dishNames: string[] = [];
        if (appointment.dishes && Array.isArray(appointment.dishes)) {
          for (const dish of appointment.dishes) {
            if (typeof dish === 'string') {
              dishNames.push('未知菜品'); // 这里只有ID，没有名称
            } else {
              dishNames.push(dish.name || '未知菜品');
            }
          }
        }
        
        // 添加餐次信息，包括状态和ID
        userAppointment.meals.push({
          type: appointment.mealType,
          dishes: dishNames,
          status: appointment.status || '待确认',
          id: appointment.id
        });
      }
      
      // 将Map转换为数组
      const userAppointments = Array.from(userAppointmentMap.values());
      
      // 排序餐次：早餐、午餐、晚餐
      for (const user of userAppointments) {
        user.meals.sort((a, b) => {
          const order = { [MealType.Breakfast]: 1, [MealType.Lunch]: 2, [MealType.Dinner]: 3 };
          return order[a.type as MealType] - order[b.type as MealType];
        });
      }

      // 如果只有一个用户，则默认展开
      if (userAppointments.length === 1) {
        userAppointments[0].isExpanded = true;
      } else {
        // 多个用户时默认全部折叠
        userAppointments.forEach(user => {
          user.isExpanded = false;
        });
      }
      
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

      console.log(`加载到${userAppointments.length}个用户的预约`);
      console.log('userAppointments:', userAppointments);
      
      this.setData({
        userAppointments,
        selectedDateDisplay,
        isLoading: false
      });
      
      hideLoading();
    } catch (error) {
      console.error('加载预约数据时出错:', error);
      
      // 发生错误时，至少确保有一个空列表显示
      this.setData({
        userAppointments: [],
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
        this.updateCalendarMarks();
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
        this.loadUserAppointments();
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
      
      // 更新选中日期并加载该日期的预约
      this.setData({ 
        selectedDate,
        isLoading: true 
      }, () => {
        this.loadUserAppointments();
      });
    } catch (error) {
      console.error('处理日历选择事件时出错:', error);
      hideLoading();
      this.setData({ isLoading: false });
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
      this.loadUserAppointments();
    }

    // 日历加载完成后，确保标记已更新
    this.updateCalendarMarks(firstDay, lastDay);
  },

  // 确认预约
  async confirmAppointment(e: any) {
    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }
      
      showLoading('确认预约中');
      
      // 调用AppointmentService的confirmAppointment方法
      const result = await AppointmentService.confirmAppointment(appointmentId);
      
      if (result.success) {
        hideLoading();
        showToast('预约已确认');
        
        // 重新加载预约列表
        this.loadUserAppointments();
      } else {
        throw new Error('确认预约失败');
      }
    } catch (error) {
      console.error('确认预约失败:', error);
      hideLoading();
      showToast('确认预约失败');
    }
  },
  
  // 取消预约
  async cancelAppointment(e: any) {
    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }
      
      // 弹窗确认是否取消预约
      wx.showModal({
        title: '确认取消',
        content: '确定要取消此预约吗？',
        success: async (res) => {
          if (res.confirm) {
            showLoading('取消预约中');
            
            // 调用AppointmentService的cancelAppointment方法
            const result = await AppointmentService.cancelAppointment(appointmentId, '管理员取消');
            
            if (result.success) {
              hideLoading();
              showToast('预约已取消');
              
              // 重新加载预约列表
              this.loadUserAppointments();
            } else {
              hideLoading();
              showToast('取消预约失败');
            }
          }
        }
      });
    } catch (error) {
      console.error('取消预约失败:', error);
      hideLoading();
      showToast('取消预约失败');
    }
  },
  
  // 完成预约
  async completeAppointment(e: any) {
    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }
      
      showLoading('更新状态中');
      
      // 调用AppointmentService的completeAppointment方法
      const result = await AppointmentService.completeAppointment(appointmentId);
      
      if (result.success) {
        hideLoading();
        showToast('预约已完成');
        
        // 重新加载预约列表
        this.loadUserAppointments();
      } else {
        throw new Error('更新状态失败');
      }
    } catch (error) {
      console.error('完成预约失败:', error);
      hideLoading();
      showToast('完成预约失败');
    }
  },
  
  // 查看评价
  viewReview(e: any) {
    try {
      const { appointmentId, userName } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }
      
      // 跳转到评价详情页面
      wx.navigateTo({
        url: `../reviews/reviews?appointmentId=${appointmentId}&userName=${userName || '用户'}`
      });
    } catch (error) {
      console.error('查看评价失败:', error);
      showToast('查看评价失败');
    }
  },

  // 切换用户预约列表的展开/折叠状态
  toggleUserExpand(e: any) {
    const { index } = e.currentTarget.dataset;
    
    // 使用setTimeout确保UI更新优先级较高
    setTimeout(() => {
      const userAppointments = [...this.data.userAppointments];
    
      // 切换当前用户的展开状态
      userAppointments[index].isExpanded = !userAppointments[index].isExpanded;
      
      this.setData({
        userAppointments
      });
    }, 10);
  }
}); 