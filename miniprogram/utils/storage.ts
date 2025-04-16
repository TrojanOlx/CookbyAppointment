import { Dish, Appointment, InventoryItem, DishType, SpicyLevel, MealType } from './model';

// 存储键名
const DISHES_KEY = 'dishes';
const APPOINTMENTS_KEY = 'appointments';
const INVENTORY_KEY = 'inventories';

// 生成唯一ID
export function generateId(): string {
  // 加入当前时间戳和随机数，确保唯一性
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + '-' + Math.random().toString(36).substr(2, 5);
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
  
  // 在添加测试数据前，先检查是否已经存在相同ID的测试数据
  // 食材库存测试数据
  if (existingInventory.length > 0) {
    // 过滤掉已有的测试数据ID
    const existingIds = existingInventory.map(item => item.id);
    for (let i = 1; i <= 12; i++) {
      if (existingIds.includes(`test-inv${i}`)) {
        console.log(`测试数据 test-inv${i} 已存在，跳过添加`);
        return; // 如果发现任何一个测试ID已存在，则认为测试数据已被添加过
      }
    }
  }
  
  // 菜品测试数据
  if (existingDishes.length > 0) {
    // 过滤掉已有的测试数据ID
    const existingIds = existingDishes.map(item => item.id);
    for (let i = 1; i <= 5; i++) {
      if (existingIds.includes(`test-dish${i}`)) {
        console.log(`测试数据 test-dish${i} 已存在，跳过添加`);
        return; // 如果发现任何一个测试ID已存在，则认为测试数据已被添加过
      }
    }
  }
  
  // 预约测试数据
  if (existingAppointments.length > 0) {
    // 过滤掉已有的测试数据ID
    const existingIds = existingAppointments.map(item => item.id);
    for (let i = 1; i <= 3; i++) {
      if (existingIds.includes(`test-app${i}`)) {
        console.log(`测试数据 test-app${i} 已存在，跳过添加`);
        return; // 如果发现任何一个测试ID已存在，则认为测试数据已被添加过
      }
    }
  }
  
  // 添加测试菜品
  const testDishes: Dish[] = [
    {
      id: 'test-dish1',
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
      id: 'test-dish2',
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
      id: 'test-dish3',
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
      id: 'test-dish4',
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
      id: 'test-dish5',
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
      id: 'test-app1',
      date: formatDateStr(today),
      mealType: MealType.Breakfast,
      dishes: ['test-dish3'],
      createTime: Date.now()
    },
    {
      id: 'test-app2',
      date: formatDateStr(today),
      mealType: MealType.Dinner,
      dishes: ['test-dish1', 'test-dish2'],
      createTime: Date.now()
    },
    {
      id: 'test-app3',
      date: formatDateStr(new Date(today.getTime() + 24 * 60 * 60 * 1000)), // 明天
      mealType: MealType.Lunch,
      dishes: ['test-dish4', 'test-dish5'],
      createTime: Date.now()
    }
  ];
  
  // 添加测试库存
  const testInventory: InventoryItem[] = [
    {
      id: 'test-inv1',
      name: '鸡蛋',
      amount: '10个',
      putInDate: formatDateStr(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)), // 前天
      expiryDate: formatDateStr(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)), // 10天后
      createTime: Date.now() - 100000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv2',
      name: '西红柿',
      amount: '5个',
      putInDate: formatDateStr(today),
      expiryDate: formatDateStr(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)), // 7天后
      createTime: Date.now() - 200000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv3',
      name: '豆腐',
      amount: '2块',
      putInDate: formatDateStr(yesterday),
      expiryDate: formatDateStr(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)), // 3天后
      createTime: Date.now() - 300000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv4',
      name: '排骨',
      amount: '500g',
      putInDate: formatDateStr(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)), // 2天后
      createTime: Date.now() - 400000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv5',
      name: '油麦菜',
      amount: '1把',
      putInDate: formatDateStr(yesterday),
      expiryDate: formatDateStr(today), // 今天到期
      createTime: Date.now() - 500000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv6',
      name: '葱',
      amount: '5根',
      putInDate: formatDateStr(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)), // 昨天过期
      createTime: Date.now() - 600000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv7',
      name: '冬瓜',
      amount: '1个',
      putInDate: formatDateStr(new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)), // 5天后
      createTime: Date.now() - 700000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv8',
      name: '牛肉',
      amount: '300g',
      putInDate: formatDateStr(yesterday),
      expiryDate: formatDateStr(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)), // 3天后
      createTime: Date.now() - 800000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv9',
      name: '花椒',
      amount: '小袋',
      putInDate: formatDateStr(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)), // 半年后
      createTime: Date.now() - 900000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv10',
      name: '草鱼',
      amount: '1条',
      putInDate: formatDateStr(today),
      expiryDate: formatDateStr(new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000)), // 明天到期
      createTime: Date.now() - 1000000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv11',
      name: '大米',
      amount: '5kg',
      putInDate: formatDateStr(new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() + 300 * 24 * 60 * 60 * 1000)), // 300天后
      createTime: Date.now() - 1100000,
      image: '/images/default-food.png'
    },
    {
      id: 'test-inv12',
      name: '酱油',
      amount: '1瓶',
      putInDate: formatDateStr(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)),
      expiryDate: formatDateStr(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)), // 前天过期
      createTime: Date.now() - 1200000,
      image: '/images/default-food.png'
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
  } else {
    // 如果已有一些库存数据，但不是全部测试数据，需要检查并添加不重复的测试数据
    let updatedInventory = [...existingInventory];
    const existingIds = existingInventory.map(item => item.id);
    
    for (const testItem of testInventory) {
      if (!existingIds.includes(testItem.id)) {
        updatedInventory.push(testItem);
      }
    }
    
    setData(INVENTORY_KEY, updatedInventory);
  }
}

// 菜品相关操作
export const dishService = {
  // 获取所有菜品
  getAllDishes(): Dish[] {
    let dishes = getData<Dish>(DISHES_KEY);
    
    // 检查并去除重复ID
    const uniqueDishes: Dish[] = [];
    const idSet = new Set<string>();
    
    for (const dish of dishes) {
      if (!idSet.has(dish.id)) {
        idSet.add(dish.id);
        uniqueDishes.push(dish);
      } else {
        console.warn(`菜品中发现重复ID: ${dish.id}，已过滤`);
      }
    }
    
    // 如果有重复项，更新存储
    if (uniqueDishes.length !== dishes.length) {
      console.warn(`菜品中共有 ${dishes.length - uniqueDishes.length} 个重复项已被移除`);
      setData(DISHES_KEY, uniqueDishes);
      dishes = uniqueDishes;
    }
    
    return dishes;
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
    
    // 检查是否已存在相同ID
    if (dishes.some(existingDish => existingDish.id === dish.id)) {
      console.warn(`尝试添加的菜品ID: ${dish.id} 已存在，将自动生成新ID`);
      dish.id = generateId(); // 重新生成ID
    }
    
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
    let appointments = getData<Appointment>(APPOINTMENTS_KEY);
    
    // 检查并去除重复ID
    const uniqueAppointments: Appointment[] = [];
    const idSet = new Set<string>();
    
    for (const appointment of appointments) {
      if (!idSet.has(appointment.id)) {
        idSet.add(appointment.id);
        uniqueAppointments.push(appointment);
      } else {
        console.warn(`预约中发现重复ID: ${appointment.id}，已过滤`);
      }
    }
    
    // 如果有重复项，更新存储
    if (uniqueAppointments.length !== appointments.length) {
      console.warn(`预约中共有 ${appointments.length - uniqueAppointments.length} 个重复项已被移除`);
      setData(APPOINTMENTS_KEY, uniqueAppointments);
      appointments = uniqueAppointments;
    }
    
    return appointments;
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
    
    // 检查是否已存在相同ID
    if (appointments.some(existingAppointment => existingAppointment.id === appointment.id)) {
      console.warn(`尝试添加的预约ID: ${appointment.id} 已存在，将自动生成新ID`);
      appointment.id = generateId(); // 重新生成ID
    }
    
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
    let items = getData<InventoryItem>(INVENTORY_KEY);
    
    // 检查并去除重复ID
    const uniqueItems: InventoryItem[] = [];
    const idSet = new Set<string>();
    
    for (const item of items) {
      if (!idSet.has(item.id)) {
        idSet.add(item.id);
        uniqueItems.push(item);
      } else {
        console.warn(`库存中发现重复ID: ${item.id}，已过滤`);
      }
    }
    
    // 如果有重复项，更新存储
    if (uniqueItems.length !== items.length) {
      console.warn(`库存中共有 ${items.length - uniqueItems.length} 个重复项已被移除`);
      setData(INVENTORY_KEY, uniqueItems);
      items = uniqueItems;
    }
    
    return items;
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
    
    // 检查是否已存在相同ID
    if (items.some(existingItem => existingItem.id === item.id)) {
      console.warn(`尝试添加的库存ID: ${item.id} 已存在，将自动生成新ID`);
      item.id = generateId(); // 重新生成ID
    }
    
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