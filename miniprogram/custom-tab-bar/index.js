Component({
  data: {
    selected: 0,
    list: [{
      pagePath: "/pages/index/index",
      text: "首页",
      icon: "🏠"
    }, {
      pagePath: "/pages/menu/menu",
      text: "菜单",
      icon: "🍽️"
    }, {
      pagePath: "/pages/appointment/appointment",
      text: "预约",
      icon: "📅"
    }, {
      pagePath: "/pages/inventory/inventory",
      text: "库存",
      icon: "🧊"
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
      const currentPage = pages[pages.length - 1];
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