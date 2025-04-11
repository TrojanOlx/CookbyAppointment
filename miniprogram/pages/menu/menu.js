// menu.js - JavaScript备份版本
Page({
  /**
   * 页面的初始数据
   */
  data: {
    dishes: [],
    selectedType: '' // 空字符串表示全部类型
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function() {
    this.loadDishes();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    // 每次显示页面时重新加载数据，以获取最新数据
    this.loadDishes();
  },

  /**
   * 加载菜品数据
   */
  loadDishes: function() {
    const dishService = require('../../utils/storage').dishService;
    let dishes;
    
    if (this.data.selectedType) {
      dishes = dishService.getDishesByType(this.data.selectedType);
    } else {
      dishes = dishService.getAllDishes();
    }
    
    // 按创建时间逆序排列，最新创建的排在前面
    dishes.sort((a, b) => b.createTime - a.createTime);
    
    this.setData({
      dishes
    });
  },

  /**
   * 选择类型
   */
  selectType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      selectedType: type
    });
    this.loadDishes();
  },

  /**
   * 跳转到菜品详情页
   */
  goToDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `./detail/detail?id=${id}`
    });
  },

  /**
   * 跳转到添加菜品页
   */
  goToAdd: function() {
    wx.navigateTo({
      url: './add/add'
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.loadDishes();
    wx.stopPullDownRefresh();
  }
}); 