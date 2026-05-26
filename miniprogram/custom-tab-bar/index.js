Component({
  data: {
    selected: 0,
    list: [{
      pagePath: "/pages/index/index",
      text: "首页",
      icon: "/images/icons/icon-home.svg"
    }, {
      pagePath: "/pages/menu/menu",
      text: "菜单",
      icon: "/images/icons/icon-menu.svg"
    }, {
      pagePath: "/pages/appointment/appointment",
      text: "预约",
      icon: "/images/icons/icon-appointment.svg"
    }, {
      pagePath: "/pages/profile/profile",
      text: "我的",
      icon: "/images/icons/icon-profile.svg"
    }]
  },
  
  // 组件生命周期
  attached() {
    this.setData({
      selected: this.getTabBarIndex()
    });
  },
  
  methods: {
    // 获取当前页面对应的TabBar索引
    getTabBarIndex() {
      const pages = getCurrentPages();
      // 添加安全检查，确保pages不为空且currentPage存在
      if (!pages || pages.length === 0) {
        console.warn('getCurrentPages()返回空数组');
        return 0;
      }
      
      const currentPage = pages[pages.length - 1];
      if (!currentPage || !currentPage.route) {
        console.warn('当前页面信息不完整:', currentPage);
        return 0;
      }
      
      const url = `/${currentPage.route}`;
      const list = this.data.list;
      
      for (let i = 0; i < list.length; i++) {
        if (list[i].pagePath === url) {
          return i;
        }
      }
      return 0;
    },
    
    // 切换Tab
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const url = this.data.list[index].pagePath;
      
      wx.switchTab({
        url
      });
      
      this.setData({
        selected: index
      });
    }
  }
}); 