import { Dish, Appointment, InventoryItem } from './model';

// 存储键名
const DISHES_KEY = 'dishes';
const APPOINTMENTS_KEY = 'appointments';
const INVENTORY_KEY = 'inventories';

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 通用存储函数
function setData<T>(key: string, data: T[]): void {
  wx.setStorageSync(key, JSON.stringify(data));
}

// 通用获取函数
function getData<T>(key: string): T[] {
  const data = wx.getStorageSync(key);
  return data ? JSON.parse(data) : [];
}

// 菜品相关操作
export const dishService = {
  // 获取所有菜品
  getAllDishes(): Dish[] {
    return getData<Dish>(DISHES_KEY);
  },

  // 按类型获取菜品
  getDishesByType(type: string): Dish[] {
    const dishes = this.getAllDishes();
    return dishes.filter(dish => dish.type === type);
  },

  // 获取单个菜品
  getDishById(id: string): Dish | undefined {
    const dishes = this.getAllDishes();
    return dishes.find(dish => dish.id === id);
  },

  // 添加菜品
  addDish(dish: Dish): void {
    const dishes = this.getAllDishes();
    dishes.push(dish);
    setData(DISHES_KEY, dishes);
  },

  // 更新菜品
  updateDish(dish: Dish): boolean {
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
  deleteDish(id: string): boolean {
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

// 预约相关操作
export const appointmentService = {
  // 获取所有预约
  getAllAppointments(): Appointment[] {
    return getData<Appointment>(APPOINTMENTS_KEY);
  },

  // 获取指定日期的预约
  getAppointmentByDate(date: string): Appointment[] {
    const appointments = this.getAllAppointments();
    return appointments.filter(appointment => appointment.date === date);
  },

  // 获取单个预约
  getAppointmentById(id: string): Appointment | undefined {
    const appointments = this.getAllAppointments();
    return appointments.find(appointment => appointment.id === id);
  },

  // 添加预约
  addAppointment(appointment: Appointment): void {
    const appointments = this.getAllAppointments();
    appointments.push(appointment);
    setData(APPOINTMENTS_KEY, appointments);
  },

  // 更新预约
  updateAppointment(appointment: Appointment): boolean {
    const appointments = this.getAllAppointments();
    const index = appointments.findIndex(a => a.id === appointment.id);
    if (index !== -1) {
      appointments[index] = appointment;
      setData(APPOINTMENTS_KEY, appointments);
      return true;
    }
    return false;
  },

  // 删除预约
  deleteAppointment(id: string): boolean {
    const appointments = this.getAllAppointments();
    const index = appointments.findIndex(appointment => appointment.id === id);
    if (index !== -1) {
      appointments.splice(index, 1);
      setData(APPOINTMENTS_KEY, appointments);
      return true;
    }
    return false;
  }
};

// 库存相关操作
export const inventoryService = {
  // 获取所有库存
  getAllInventory(): InventoryItem[] {
    return getData<InventoryItem>(INVENTORY_KEY);
  },

  // 根据名称搜索库存
  searchInventoryByName(name: string): InventoryItem[] {
    const items = this.getAllInventory();
    return items.filter(item => item.name.includes(name));
  },

  // 获取单个库存项
  getInventoryById(id: string): InventoryItem | undefined {
    const items = this.getAllInventory();
    return items.find(item => item.id === id);
  },

  // 添加库存
  addInventory(item: InventoryItem): void {
    const items = this.getAllInventory();
    items.push(item);
    setData(INVENTORY_KEY, items);
  },

  // 更新库存
  updateInventory(item: InventoryItem): boolean {
    const items = this.getAllInventory();
    const index = items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      items[index] = item;
      setData(INVENTORY_KEY, items);
      return true;
    }
    return false;
  },

  // 删除库存
  deleteInventory(id: string): boolean {
    const items = this.getAllInventory();
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      items.splice(index, 1);
      setData(INVENTORY_KEY, items);
      return true;
    }
    return false;
  }
}; 