// 引入数据管理工具
const { getAllAppointments, getDishById } = require('../../../utils/storage');

Page({
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
    const appointments = allAppointments.map(appointment => {
      // 获取菜品名称
      const dishNames = appointment.dishes.map(dishId => {
        const dish = getDishById(dishId);
        return dish ? dish.name : '未知菜品';
      });
      
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
  viewAppointment(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/appointment/select/select?id=${id}&mode=view`
    });
  },
  
  // 编辑预约
  editAppointment(e) {
    const id = e.currentTarget.dataset.id;
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