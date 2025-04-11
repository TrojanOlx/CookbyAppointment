import { Dish } from '../../../utils/model';
import { dishService } from '../../../utils/storage';
import { showSuccess, showConfirm } from '../../../utils/util';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dish: {} as Dish,
    dishId: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.id) {
      this.setData({
        dishId: options.id
      });
      this.loadDish();
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面都重新加载数据，以便获取最新的编辑结果
    if (this.data.dishId) {
      this.loadDish();
    }
  },

  /**
   * 加载菜品数据
   */
  loadDish() {
    const dish = dishService.getDishById(this.data.dishId);
    if (dish) {
      this.setData({ dish });
    } else {
      wx.showToast({
        title: '菜品不存在',
        icon: 'error',
        complete: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    }
  },

  /**
   * 编辑菜品
   */
  editDish() {
    wx.navigateTo({
      url: `../add/add?id=${this.data.dishId}`
    });
  },

  /**
   * 删除菜品
   */
  async deleteDish() {
    const confirmed = await showConfirm('确认删除', '确定要删除这个菜品吗？');
    if (confirmed) {
      const success = dishService.deleteDish(this.data.dishId);
      if (success) {
        showSuccess('删除成功');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    }
  }
}) 