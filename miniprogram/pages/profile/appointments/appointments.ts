// 引入数据管理工具和类型定义
import { getAllAppointments, getDishById } from '../../../utils/storage';
import { Appointment, Dish, AppointmentStatus, MealType } from '../../../utils/model';

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
    
    // 获取所有预约
    const allAppointments = getAllAppointments();
    
    // TODO: 实际项目中应该根据用户ID筛选预约
    // 这里暂时展示所有预约
    
    // 处理每个预约，添加菜品名称
    const appointments = allAppointments.map((appointment: Appointment) => {
      // 判断dishes是字符串数组还是对象数组
      let dishNames: string[] = [];
      
      if (appointment.dishes && appointment.dishes.length > 0) {
        if (typeof appointment.dishes[0] === 'string') {
          // dishes是字符串ID数组
          dishNames = (appointment.dishes as string[]).map(dishId => {
            const dish = getDishById(dishId);
            return dish ? dish.name : '未知菜品';
          });
        } else {
          // dishes是对象数组，直接获取name
          dishNames = (appointment.dishes as unknown as Dish[]).map(dish => {
            return dish.name || '未知菜品';
          });
        }
      }
      
      return {
        ...appointment,
        dishNames
      };
    });
    
    // 更新数据
    this.setData({
      appointments,
      loading: false
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