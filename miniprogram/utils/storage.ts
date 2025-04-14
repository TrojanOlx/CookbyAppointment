import { Dish, Appointment, InventoryItem, DishType, SpicyLevel, MealType } from './model';

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

// 添加测试数据
export function initTestData(): void {
  // 检查是否已经有数据
  const existingDishes = getData<Dish>(DISHES_KEY);
  const existingAppointments = getData<Appointment>(APPOINTMENTS_KEY);
  const existingInventory = getData<InventoryItem>(INVENTORY_KEY);
  
  // 如果已经有数据，则不添加测试数据
  if (existingDishes.length > 0 && existingAppointments.length > 0 && existingInventory.length > 0) {
    return;
  }
  
  // 添加测试菜品
  const testDishes: Dish[] = [
    {
      id: 'dish1',
      name: '西红柿炒鸡蛋',
      type: DishType.Stir,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing1', name: '西红柿', amount: '2个' },
        { id: 'ing2', name: '鸡蛋', amount: '3个' },
        { id: 'ing3', name: '葱', amount: '适量' },
        { id: 'ing4', name: '盐', amount: '适量' }
      ],
      steps: [
        '西红柿洗净切块，葱切段',
        '鸡蛋打散加少许盐搅拌均匀',
        '锅中倒油，油热后倒入鸡蛋，略炒至成型',
        '放入西红柿翻炒，加入适量盐调味',
        '最后撒上葱花即可'
      ],
      notice: '炒鸡蛋时火候不要太大，以免煎老',
      remark: '适合家常食用',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'dish2',
      name: '麻婆豆腐',
      type: DishType.Stir,
      spicy: SpicyLevel.Medium,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing5', name: '豆腐', amount: '1块' },
        { id: 'ing6', name: '肉末', amount: '100g' },
        { id: 'ing7', name: '郫县豆瓣酱', amount: '1勺' },
        { id: 'ing8', name: '花椒', amount: '少许' },
        { id: 'ing9', name: '大蒜', amount: '3瓣' }
      ],
      steps: [
        '豆腐切成小方块，用开水焯烫一下',
        '锅中放油，放入花椒爆香',
        '加入肉末炒散',
        '加入豆瓣酱炒出红油',
        '加入豆腐块，轻轻翻炒',
        '加入适量水，大火烧开',
        '最后勾芡，撒上葱花即可'
      ],
      notice: '翻炒时注意不要把豆腐弄碎',
      remark: '经典川菜',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'dish3',
      name: '清炒油麦菜',
      type: DishType.Vegetable,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing10', name: '油麦菜', amount: '1把' },
        { id: 'ing11', name: '蒜', amount: '2瓣' },
        { id: 'ing12', name: '盐', amount: '适量' }
      ],
      steps: [
        '油麦菜洗净，切成段',
        '锅中放油，放入蒜末爆香',
        '加入油麦菜快速翻炒',
        '加入盐调味即可'
      ],
      notice: '油麦菜炒熟后会缩水，注意准备足够量',
      remark: '清淡爽口',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'dish4',
      name: '排骨冬瓜汤',
      type: DishType.Soup,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing13', name: '排骨', amount: '300g' },
        { id: 'ing14', name: '冬瓜', amount: '半个' },
        { id: 'ing15', name: '姜', amount: '3片' },
        { id: 'ing16', name: '盐', amount: '适量' }
      ],
      steps: [
        '排骨焯水去血水',
        '冬瓜去皮切块',
        '锅中加入清水，放入排骨和姜片',
        '大火烧开后转小火炖1小时',
        '加入冬瓜继续炖20分钟',
        '最后加盐调味即可'
      ],
      notice: '冬瓜不要煮太久，避免煮烂',
      remark: '清热解暑',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'dish5',
      name: '水煮鱼',
      type: DishType.Stir,
      spicy: SpicyLevel.Hot,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing17', name: '草鱼', amount: '1条' },
        { id: 'ing18', name: '豆芽', amount: '适量' },
        { id: 'ing19', name: '干辣椒', amount: '10个' },
        { id: 'ing20', name: '花椒', amount: '1勺' },
        { id: 'ing21', name: '郫县豆瓣酱', amount: '2勺' }
      ],
      steps: [
        '鱼处理干净，切片，用料酒和姜腌制10分钟',
        '豆芽焯水后垫在碗底',
        '热锅冷油，放入干辣椒、花椒爆香',
        '加入豆瓣酱炒出红油',
        '加入适量水烧开',
        '将鱼片放入锅中，大火烧至断生',
        '淋上热油即可'
      ],
      notice: '鱼片要顺着鱼纹切，避免破碎',
      remark: '麻辣鲜香的川菜代表',
      reference: '',
      createTime: Date.now()
    }
  ];
  
  // 添加测试预约
  const today = new Date();
  const formatDateStr = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000); // 定义昨天的日期
  
  const testAppointments: Appointment[] = [
    {
      id: 'app1',
      date: formatDateStr(today),
      mealType: MealType.Breakfast,
      dishes: ['dish3'],
      createTime: Date.now()
    },
    {
      id: 'app2',
      date: formatDateStr(today),
      mealType: MealType.Dinner,
      dishes: ['dish1', 'dish2'],
      createTime: Date.now()
    },
    {
      id: 'app3',
      date: formatDateStr(new Date(today.getTime() + 24 * 60 * 60 * 1000)), // 明天
      mealType: MealType.Lunch,
      dishes: ['dish4', 'dish5'],
      createTime: Date.now()
    }
  ];
  
  // 添加测试库存
  const testInventory: InventoryItem[] = [
    {
      id: 'inv1',
      name: '鸡蛋',
      amount: '10个',
      putInDate: formatDateStr(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)), // 前天
      expiryDate: formatDateStr(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)), // 10天后
      createTime: Date.now()
    },
    {
      id: 'inv2',
      name: '西红柿',
      amount: '5个',
      putInDate: formatDateStr(today),
      expiryDate: formatDateStr(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)), // 7天后
      createTime: Date.now()
    },
    {
      id: 'inv3',
      name: '豆腐',
      amount: '2块',
      putInDate: formatDateStr(yesterday),
      expiryDate: formatDateStr(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)), // 3天后
      createTime: Date.now()
    }
  ];
  
  // 存储测试数据
  if (existingDishes.length === 0) {
    setData(DISHES_KEY, testDishes);
  }
  
  if (existingAppointments.length === 0) {
    setData(APPOINTMENTS_KEY, testAppointments);
  }
  
  if (existingInventory.length === 0) {
    setData(INVENTORY_KEY, testInventory);
  }
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