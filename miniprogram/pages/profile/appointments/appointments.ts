// 引入数据管理工具和类型定义
import { AppointmentService } from '../../../services/appointmentService';
import { DishService } from '../../../services/dishService';
import { Appointment, AppointmentDish } from '../../../models/appointment';
import { AppointmentStatus, MealType } from '../../../utils/model';

// 页面数据接口
interface IPageData {
  appointments: Array<Appointment & { dishNames: string[] }>;
  loading: boolean;
}

// 页面方法接口
interface IPageMethods {
  loadAppointments: () => void;
  viewAppointment: (e: WechatMiniprogram.TouchEvent) => void;
  editAppointment: (e: WechatMiniprogram.TouchEvent) => void;
  createAppointment: () => void;
}

// 状态到样式类的映射
const statusClassMap: Record<string, string> = {
  'pending': 'status-pending',
  'confirmed': 'status-confirmed',
  'canceled': 'status-canceled',
  'completed': 'status-completed'
};

// 状态到显示文本的映射
const statusTextMap: Record<string, string> = {
  'pending': '待确认',
  'confirmed': '已确认',
  'canceled': '已取消',
  'completed': '已完成'
};

Page<IPageData, IPageMethods>({
  data: {
    appointments: [],
    loading: true
  },

  onLoad() {
    this.loadAppointments();
  },
  
  onShow() {
    // 每次显示页面时刷新数据
    this.loadAppointments();
  },
  
  onPullDownRefresh() {
    this.loadAppointments();
    wx.stopPullDownRefresh();
  },
  
  // 加载预约数据
  loadAppointments() {
    // 获取用户信息，确认是否登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    // 先设置加载状态
    this.setData({ loading: true });
    
    // 使用AppointmentService获取预约列表
    AppointmentService.getAppointmentList()
      .then(async (result) => {
        const appointmentsData = result.list;
        
        // 处理每个预约，添加菜品名称
        const appointments = await Promise.all(appointmentsData.map(async (appointment) => {
          // 获取预约关联的菜品
          let dishNames: string[] = [];
          
          if (appointment.id) {
            try {
              const appointmentDishes = await AppointmentService.getAppointmentDishes(appointment.id);
              
              // 使用Promise.all并行获取所有菜品名称
              dishNames = await Promise.all(appointmentDishes.map(async (ad) => {
                try {
                  const dishDetail = await DishService.getDishDetail(ad.dishId);
                  return dishDetail.name || '未知菜品';
                } catch (error) {
                  console.error(`获取菜品名称失败: ${ad.dishId}`, error);
                  return '未知菜品';
                }
              }));
            } catch (error) {
              console.error('获取预约菜品失败', error);
              dishNames = ['获取菜品失败'];
            }
          }
          
          return {
            ...appointment,
            dishNames
          };
        }));
        
        // 更新数据
        this.setData({
          appointments,
          loading: false
        });
      })
      .catch(error => {
        console.error('获取预约列表失败', error);
        wx.showToast({
          title: '获取预约列表失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      });
  },
  
  // 查看预约详情
  viewAppointment(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({
      url: `/pages/appointment/select/select?id=${id}&mode=view`
    });
  },
  
  // 编辑预约
  editAppointment(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({
      url: `/pages/appointment/select/select?id=${id}&mode=edit`
    });
  },
  
  // 创建新预约
  createAppointment() {
    wx.switchTab({
      url: '/pages/appointment/appointment'
    });
  }
}); 