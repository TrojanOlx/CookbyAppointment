// 引入数据管理工具和类型定义
import { AdminAppointmentService } from '../services/adminAppointmentService';
import { AppointmentService } from '../../../../services/appointmentService';
import { Appointment, AppointmentStatus, MealType } from '../../../../models/appointment';
import { formatDate, getCurrentDate, showLoading, hideLoading, showToast } from '../../../../utils/util';
import { requestSubscribeForAdmin } from '../../../../services/notificationService';
import { UserService } from '../../../../services/userService';
const { getFamilyRoleContext } = require('../../../../services/familyRole');
import { request } from '../../../../services/http';

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
  isRendered?: boolean;
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

interface CompletionDeduction {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
}

interface CompletionUnresolved {
  label: string;
}

interface CompletionPreview {
  appointmentId: string;
  appointmentUpdateTime: number | null;
  deductions: CompletionDeduction[];
  unresolved: CompletionUnresolved[];
}

interface CompletionResponse {
  success?: boolean;
  requiresInventoryConfirmation?: boolean;
  appointmentUpdateTime?: number;
  deductions?: Array<Partial<CompletionDeduction>>;
  unresolved?: Array<Record<string, any>>;
}

interface CompletionRequest {
  id: string;
  confirmDeduction?: boolean;
  deductions?: CompletionDeduction[];
  expectedUpdateTime?: number;
}

const unresolvedReasonLabel: Record<string, string> = {
  quantity_not_convertible: '数量单位无法换算',
  inventory_insufficient: '库存不足'
};

const APPOINTMENT_STATUS_ALIASES: Record<string, AppointmentStatus> = {
  '待确认': AppointmentStatus.Pending,
  pending: AppointmentStatus.Pending,
  '已确认': AppointmentStatus.Confirmed,
  confirmed: AppointmentStatus.Confirmed,
  '已完成': AppointmentStatus.Completed,
  completed: AppointmentStatus.Completed,
  '已取消': AppointmentStatus.Cancelled,
  cancelled: AppointmentStatus.Cancelled
};

function normalizeAppointmentStatus(value: unknown): AppointmentStatus {
  return APPOINTMENT_STATUS_ALIASES[String(value || '').trim().toLowerCase()] || AppointmentStatus.Pending;
}

const normalizeCompletionPreview = (
  appointmentId: string,
  response: CompletionResponse
): CompletionPreview => {
  const deductions = Array.isArray(response.deductions)
    ? response.deductions.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || '未命名食材'),
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
      unit: item.unit === undefined || item.unit === null ? null : String(item.unit)
    }))
    : [];
  const unresolved = Array.isArray(response.unresolved)
    ? response.unresolved.map((item) => {
      const name = String(item.name || item.ingredient || '未匹配食材');
      const reason = unresolvedReasonLabel[String(item.reason || '')] || '暂时无法扣减';
      const missing = item.missingQuantity === undefined || item.missingQuantity === null
        ? ''
        : `，还缺 ${item.missingQuantity}${item.unit || ''}`;
      return { label: `${name}：${reason}${missing}` };
    })
    : [];

  return {
    appointmentId,
    appointmentUpdateTime: typeof response.appointmentUpdateTime === 'number'
      ? response.appointmentUpdateTime
      : null,
    deductions,
    unresolved
  };
};

const completeAppointmentRequest = (
  payload: CompletionRequest,
  idempotencyKey?: string
): Promise<CompletionResponse> => {
  const storedFamily = wx.getStorageSync('active_family_id');
  const familyId = storedFamily && typeof storedFamily === 'object'
    ? storedFamily.id || storedFamily.familyId || storedFamily.family_id || ''
    : storedFamily;
  const options: {
    url: string;
    method: 'PUT';
    data: CompletionRequest;
    header?: Record<string, string>;
  } = {
    url: '/api/appointment/complete',
    method: 'PUT',
    data: payload
  };
  if (familyId !== undefined && familyId !== null && familyId !== '') {
    options.header = { 'X-Family-Id': String(familyId) };
  }
  if (idempotencyKey) {
    options.header = { ...(options.header || {}), 'Idempotency-Key': idempotencyKey };
  }
  // request 统一注入 Authorization，家庭上下文仅在选中家庭时附加。
  return request<CompletionResponse>(options);
};

let adminAppointmentListRequestId = 0;
let adminAppointmentMutationRequestId = 0;
let adminRoleRequestId = 0;
const COMPLETION_EXIT_MS = 160;
const EXPANSION_EXIT_MS = 180;

const currentAppointmentScope = () => {
  const storedFamily = wx.getStorageSync('active_family_id');
  const familyId = storedFamily && typeof storedFamily === 'object'
    ? storedFamily.id || storedFamily.familyId || storedFamily.family_id || ''
    : storedFamily;
  return `${String(wx.getStorageSync('token') || '')}:${String(familyId || '')}`;
};

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
    canManageAppointments: false,
    familyRole: '',
    firstDay: '',
    lastDay: '',
    completionPreview: null as CompletionPreview | null,
    completionActive: false,
    isCompleting: false,
    isMutatingAppointment: false
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
    const scope = currentAppointmentScope();
    if ((this as any)._appointmentScope && (this as any)._appointmentScope !== scope) {
      adminAppointmentListRequestId += 1;
      adminAppointmentMutationRequestId += 1;
      adminRoleRequestId += 1;
      this.clearAppointmentMotionTimers();
      delete (this as any)._completionIdempotencyKey;
      this.setData({
        userAppointments: [],
        completionPreview: null,
        completionActive: false,
        isCompleting: false,
        isMutatingAppointment: false
      });
    }
    (this as any)._appointmentScope = scope;
    this.syncRoleVisibility();
  },

  async syncRoleVisibility() {
    const requestId = ++adminRoleRequestId;
    const sessionScope = currentAppointmentScope();
    const isCurrentRequest = () => requestId === adminRoleRequestId
      && sessionScope === currentAppointmentScope();
    if (!wx.getStorageSync('token')) {
      this.setData({ canManageAppointments: false, familyRole: '', userAppointments: [] });
      return;
    }
    let legacyAdmin = false;
    try {
      const result = await UserService.checkAdmin();
      if (!isCurrentRequest()) return;
      legacyAdmin = !!result.isAdmin;
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.warn('检查旧版管理员状态失败:', error);
    }

    const context = await getFamilyRoleContext();
    if (!isCurrentRequest()) return;
    const canManageAppointments = legacyAdmin || context.canManageAppointments;
    this.setData({
      canManageAppointments,
      familyRole: context.role
    });

    // 仅在角色已确认有权限时加载管理员预约数据，避免普通成员进入深链触发权限跳转。
    if (!canManageAppointments) {
      this.setData({ userAppointments: [] });
      return;
    }
    if (this.data.selectedDate) {
      this.loadUserAppointments();
    } else {
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
    const requestId = ++adminAppointmentListRequestId;
    const selectedDate = this.data.selectedDate;
    const sessionScope = currentAppointmentScope();
    const isCurrentRequest = () => requestId === adminAppointmentListRequestId
      && selectedDate === this.data.selectedDate
      && sessionScope === currentAppointmentScope();
    try {
      // 验证日期格式
      if (!selectedDate || typeof selectedDate !== 'string' || !selectedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn('选定日期无效:', selectedDate);
        
        // 如果日期无效，使用当前日期
        const today = getCurrentDate();
        this.setData({ selectedDate: today, selectedDateDisplay: '今日', isLoading: false });
        hideLoading();
        
        console.log('使用今日日期:', today);
        return;
      }

      showLoading('加载预约中');
      this.setData({ isLoading: true });

      console.log(`加载${selectedDate}的预约数据`);
      
      // 使用AdminAppointmentService.getDateAppointments获取特定日期的预约
      const result = await AdminAppointmentService.getDateAppointments(1, 50, selectedDate);
      if (!isCurrentRequest()) return;
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
          status: normalizeAppointmentStatus(appointment.status),
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
      if (!isCurrentRequest()) return;
      
      this.setData({
        userAppointments,
        selectedDateDisplay,
        isLoading: false
      });
      
      hideLoading();
    } catch (error) {
      if (!isCurrentRequest()) return;
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
    if (this.data.isMutatingAppointment) return;

    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }

      const requestId = ++adminAppointmentMutationRequestId;
      const sessionScope = currentAppointmentScope();
      const isCurrentMutation = () => requestId === adminAppointmentMutationRequestId
        && sessionScope === currentAppointmentScope();
      this.setData({ isMutatingAppointment: true });

      // 管理员订阅「新预约」通知，确保后续有新预约时能收到推送
      await requestSubscribeForAdmin();
      if (!isCurrentMutation()) return;
      
      showLoading('确认预约中');
      
      // 调用AppointmentService的confirmAppointment方法
      const result = await AppointmentService.confirmAppointment(appointmentId);
      if (!isCurrentMutation()) return;
      
      if (result.success) {
        hideLoading();
        showToast('预约已确认');
        
        // 重新加载预约列表
        this.loadUserAppointments();
      } else {
        throw new Error('确认预约失败');
      }
    } catch (error) {
      if ((this as any)._appointmentScope !== currentAppointmentScope()) return;
      console.error('确认预约失败:', error);
      hideLoading();
      showToast('确认预约失败');
    } finally {
      if ((this as any)._appointmentScope === currentAppointmentScope()) {
        this.setData({ isMutatingAppointment: false });
      }
    }
  },
  
  // 取消预约
  async cancelAppointment(e: any) {
    if (this.data.isMutatingAppointment) return;

    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }

      const requestId = ++adminAppointmentMutationRequestId;
      const sessionScope = currentAppointmentScope();
      const isCurrentMutation = () => requestId === adminAppointmentMutationRequestId
        && sessionScope === currentAppointmentScope();
      this.setData({ isMutatingAppointment: true });
      
      // 管理员订阅「新预约」通知，确保后续有新预约时能收到推送
      await requestSubscribeForAdmin();
      if (!isCurrentMutation()) return;

      // 弹窗确认是否取消预约
      wx.showModal({
        title: '确认取消',
        content: '确定要取消此预约吗？',
        success: async (res) => {
          if (!isCurrentMutation()) return;
          if (!res.confirm) {
            this.setData({ isMutatingAppointment: false });
            return;
          }

          try {
            showLoading('取消预约中');
            
            // 调用AppointmentService的cancelAppointment方法
            const result = await AppointmentService.cancelAppointment(appointmentId, '管理员取消');
            if (!isCurrentMutation()) return;
            
            if (result.success) {
              hideLoading();
              showToast('预约已取消');
              
              // 重新加载预约列表
              this.loadUserAppointments();
            } else {
              hideLoading();
              showToast('取消预约失败');
            }
          } catch (error) {
            if (!isCurrentMutation()) return;
            console.error('取消预约失败:', error);
            hideLoading();
            showToast('取消预约失败');
          } finally {
            if (requestId === adminAppointmentMutationRequestId) this.setData({ isMutatingAppointment: false });
          }
        },
        fail: () => {
          if (requestId === adminAppointmentMutationRequestId) this.setData({ isMutatingAppointment: false });
        }
      });
    } catch (error) {
      if ((this as any)._appointmentScope !== currentAppointmentScope()) return;
      console.error('取消预约失败:', error);
      hideLoading();
      showToast('取消预约失败');
      this.setData({ isMutatingAppointment: false });
    }
  },
  
  // 完成预约
  clearAppointmentMotionTimers() {
    const completionTimer = (this as any)._completionMotionTimer;
    if (completionTimer) {
      clearTimeout(completionTimer);
      delete (this as any)._completionMotionTimer;
    }

    const expansionTimers = (this as any)._expansionMotionTimers as Map<string, { timer: ReturnType<typeof setTimeout> | null; mode: 'opening' | 'closing' }> | undefined;
    expansionTimers?.forEach((entry) => {
      if (entry.timer) clearTimeout(entry.timer);
    });
    expansionTimers?.clear();
  },

  showCompletionPreview(preview: CompletionPreview) {
    const activeTimer = (this as any)._completionMotionTimer;
    if (activeTimer) clearTimeout(activeTimer);
    const motionGeneration = ((this as any)._completionMotionGeneration || 0) + 1;
    (this as any)._completionMotionGeneration = motionGeneration;

    this.setData({ completionPreview: preview, completionActive: false }, () => {
      if ((this as any)._appointmentScope === '__unloaded__') return;
      (this as any)._completionMotionTimer = setTimeout(() => {
        delete (this as any)._completionMotionTimer;
        if (
          (this as any)._completionMotionGeneration === motionGeneration
          && this.data.completionPreview?.appointmentId === preview.appointmentId
        ) {
          this.setData({ completionActive: true });
        }
      }, 20);
    });
  },

  hideCompletionPreview() {
    const activeTimer = (this as any)._completionMotionTimer;
    if (activeTimer) clearTimeout(activeTimer);
    (this as any)._completionMotionGeneration = ((this as any)._completionMotionGeneration || 0) + 1;

    this.setData({ completionActive: false });
    (this as any)._completionMotionTimer = setTimeout(() => {
      delete (this as any)._completionMotionTimer;
      if (!this.data.completionActive) {
        this.setData({ completionPreview: null });
      }
    }, COMPLETION_EXIT_MS);
  },

  async completeAppointment(e: any) {
    if (this.data.isCompleting) return;

    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }

      const requestId = ++adminAppointmentMutationRequestId;
      const sessionScope = currentAppointmentScope();
      const isCurrentMutation = () => requestId === adminAppointmentMutationRequestId
        && sessionScope === currentAppointmentScope();
      // 管理员订阅「新预约」通知，确保后续有新预约时能收到推送
      await requestSubscribeForAdmin();
      if (!isCurrentMutation()) return;

      this.setData({ isCompleting: true });
      showLoading('检查库存中');

      // 首次请求只生成消费预览，不直接扣减库存。
      const result = await completeAppointmentRequest({ id: appointmentId });
      if (!isCurrentMutation()) return;

      if (result.requiresInventoryConfirmation) {
        hideLoading();
        (this as any)._completionIdempotencyKey = `complete:${appointmentId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
        this.setData({ isCompleting: false });
        this.showCompletionPreview(normalizeCompletionPreview(appointmentId, result));
        return;
      }

      if (result.success) {
        delete (this as any)._completionIdempotencyKey;
        hideLoading();
        showToast('预约已完成');
        
        // 重新加载预约列表
        this.loadUserAppointments();
      } else {
        throw new Error('更新状态失败');
      }
    } catch (error) {
      if ((this as any)._appointmentScope !== currentAppointmentScope()) return;
      console.error('完成预约失败:', error);
      hideLoading();
      showToast('完成预约失败');
    } finally {
      if ((this as any)._appointmentScope === currentAppointmentScope()) {
        this.setData({ isCompleting: false });
      }
    }
  },

  // 用户确认消费预览后，带扣减清单完成预约。
  async confirmCompletion() {
    const preview = this.data.completionPreview as CompletionPreview | null;
    if (!preview || this.data.isCompleting) return;

    const requestId = ++adminAppointmentMutationRequestId;
    const sessionScope = currentAppointmentScope();
    const isCurrentMutation = () => requestId === adminAppointmentMutationRequestId
      && sessionScope === currentAppointmentScope();
    this.setData({ isCompleting: true });
    try {
      showLoading('扣减库存中');
      const idempotencyKey = (this as any)._completionIdempotencyKey
        || `complete:${preview.appointmentId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
      (this as any)._completionIdempotencyKey = idempotencyKey;
      const result = await completeAppointmentRequest({
        id: preview.appointmentId,
        confirmDeduction: true,
        deductions: preview.deductions,
        expectedUpdateTime: preview.appointmentUpdateTime === null
          ? undefined
          : preview.appointmentUpdateTime
      }, idempotencyKey);
      if (!isCurrentMutation()) return;

      if (result.requiresInventoryConfirmation) {
        hideLoading();
        (this as any)._completionIdempotencyKey = `complete:${preview.appointmentId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
        this.setData({
          completionPreview: normalizeCompletionPreview(preview.appointmentId, result)
        });
        showToast('库存发生变化，请重新确认');
        return;
      }

      if (!result.success) throw new Error('更新状态失败');

      hideLoading();
      delete (this as any)._completionIdempotencyKey;
      this.hideCompletionPreview();
      showToast('预约已完成');
      this.loadUserAppointments();
    } catch (error) {
      if (!isCurrentMutation()) return;
      console.error('确认完成预约失败:', error);
      hideLoading();
      showToast('完成预约失败，请重试');
    } finally {
      if (requestId === adminAppointmentMutationRequestId) this.setData({ isCompleting: false });
    }
  },

  cancelCompletion() {
    if (this.data.isCompleting) return;
    delete (this as any)._completionIdempotencyKey;
    this.hideCompletionPreview();
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

  // 重新预约（恢复已取消的预约）
  async reactivateAppointment(e: any) {
    if (this.data.isMutatingAppointment) return;

    try {
      const { appointmentId } = e.currentTarget.dataset;
      
      if (!appointmentId) {
        showToast('未找到预约ID');
        return;
      }

      const requestId = ++adminAppointmentMutationRequestId;
      const sessionScope = currentAppointmentScope();
      const isCurrentMutation = () => requestId === adminAppointmentMutationRequestId
        && sessionScope === currentAppointmentScope();
      this.setData({ isMutatingAppointment: true });
      
      // 弹窗确认是否重新预约
      wx.showModal({
        title: '确认重新预约',
        content: '确定要恢复此已取消的预约吗？',
        success: async (res) => {
          if (!isCurrentMutation()) return;
          if (!res.confirm) {
            this.setData({ isMutatingAppointment: false });
            return;
          }

          try {
            showLoading('处理中');
            
            // 调用AppointmentService的reactivateAppointment方法
            const result = await AppointmentService.reactivateAppointment(appointmentId);
            if (!isCurrentMutation()) return;
            
            if (result.success) {
              hideLoading();
              showToast('重新预约成功');
              
              // 重新加载预约列表
              this.loadUserAppointments();
            } else {
              hideLoading();
              showToast('重新预约失败');
            }
          } catch (error) {
            if (!isCurrentMutation()) return;
            console.error('重新预约失败:', error);
            hideLoading();
            showToast('重新预约失败');
          } finally {
            if (requestId === adminAppointmentMutationRequestId) this.setData({ isMutatingAppointment: false });
          }
        },
        fail: () => {
          if (requestId === adminAppointmentMutationRequestId) this.setData({ isMutatingAppointment: false });
        }
      });
    } catch (error) {
      if ((this as any)._appointmentScope !== currentAppointmentScope()) return;
      console.error('重新预约失败:', error);
      hideLoading();
      showToast('重新预约失败');
      this.setData({ isMutatingAppointment: false });
    }
  },

  onUnload() {
    adminAppointmentListRequestId += 1;
    adminAppointmentMutationRequestId += 1;
    adminRoleRequestId += 1;
    this.clearAppointmentMotionTimers();
    (this as any)._appointmentScope = '__unloaded__';
    delete (this as any)._completionIdempotencyKey;
  },

  // 切换用户预约列表的展开/折叠状态
  toggleUserExpand(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    const user = this.data.userAppointments[index] as UserAppointment | undefined;
    if (!user) return;

    const selectedDate = this.data.selectedDate;
    const key = user.userId || String(index);
    const timers = ((this as any)._expansionMotionTimers ||= new Map<string, { timer: ReturnType<typeof setTimeout> | null; mode: 'opening' | 'closing' }>());
    const pending = timers.get(key);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      timers.delete(key);
    }

    if (pending?.mode === 'opening') {
      this.setData({
        [`userAppointments[${index}].isExpanded`]: false,
        [`userAppointments[${index}].isRendered`]: false
      });
      return;
    }

    if (user.isExpanded && pending?.mode !== 'closing') {
      this.setData({
        [`userAppointments[${index}].isExpanded`]: false,
        [`userAppointments[${index}].isRendered`]: true
      });
      const entry: { timer: ReturnType<typeof setTimeout> | null; mode: 'closing' } = { timer: null, mode: 'closing' };
      entry.timer = setTimeout(() => {
        if (timers.get(key) !== entry) return;
        timers.delete(key);
        const currentUser = this.data.userAppointments[index] as UserAppointment | undefined;
        if (this.data.selectedDate === selectedDate && currentUser?.userId === user.userId && !currentUser.isExpanded) {
          this.setData({ [`userAppointments[${index}].isRendered`]: false });
        }
      }, EXPANSION_EXIT_MS);
      timers.set(key, entry);
      return;
    }

    const entry: { timer: ReturnType<typeof setTimeout> | null; mode: 'opening' } = { timer: null, mode: 'opening' };
    timers.set(key, entry);
    this.setData({ [`userAppointments[${index}].isRendered`]: true }, () => {
      if (timers.get(key) !== entry) return;
      entry.timer = setTimeout(() => {
        if (timers.get(key) !== entry) return;
        timers.delete(key);
        const currentUser = this.data.userAppointments[index] as UserAppointment | undefined;
        if (this.data.selectedDate === selectedDate && currentUser?.userId === user.userId) {
          this.setData({ [`userAppointments[${index}].isExpanded`]: true });
        }
      }, 20);
    });
  }
});
