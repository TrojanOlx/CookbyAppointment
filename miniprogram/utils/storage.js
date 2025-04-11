// storage.js - JavaScript备份版本
const model = require('./model');

// 存储键名
const DISHES_KEY = 'dishes';
const APPOINTMENTS_KEY = 'appointments';
const INVENTORY_KEY = 'inventories';

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 通用存储函数
function setData(key, data) {
  wx.setStorageSync(key, JSON.stringify(data));
}

// 通用获取函数
function getData(key) {
  const data = wx.getStorageSync(key);
  return data ? JSON.parse(data) : [];
}

// 菜品相关操作
const dishService = {
  // 获取所有菜品
  getAllDishes() {
    return getData(DISHES_KEY);
  },

  // 按类型获取菜品
  getDishesByType(type) {
    const dishes = this.getAllDishes();
    return dishes.filter(dish => dish.type === type);
  },

  // 获取单个菜品
  getDishById(id) {
    const dishes = this.getAllDishes();
    return dishes.find(dish => dish.id === id);
  },

  // 添加菜品
  addDish(dish) {
    const dishes = this.getAllDishes();
    dishes.push(dish);
    setData(DISHES_KEY, dishes);
  },

  // 更新菜品
  updateDish(dish) {
    const dishes = this.getAllDishes();
    const index = dishes.findIndex(d => d.id === dish.id);
    if (index !== -1) {
      dishes[index] = dish;
      setData(DISHES_KEY, dishes);
      return true;
    }
    return false;
  },

  // 删除菜品
  deleteDish(id) {
    const dishes = this.getAllDishes();
    const index = dishes.findIndex(dish => dish.id === id);
    if (index !== -1) {
      dishes.splice(index, 1);
      setData(DISHES_KEY, dishes);
      return true;
    }
    return false;
  }
};

module.exports = {
  generateId,
  dishService
}; 