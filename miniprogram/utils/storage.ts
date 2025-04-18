import { Dish, Appointment, InventoryItem, DishType, SpicyLevel, MealType, AppointmentStatus, InventoryCategory, InventoryStatus } from '../utils/model';

// 内存中存储数据的变量
let memoryDishes: Dish[] = [];
let memoryAppointments: Appointment[] = [];
let memoryInventory: InventoryItem[] = [];

// 存储键名 - 仅用于兼容旧代码
const DISHES_KEY = 'dishes';
const APPOINTMENTS_KEY = 'appointments';
const INVENTORY_KEY = 'inventories';

// 标记是否已初始化
let isInitialized = false;

// 生成唯一ID
export function generateId(): string {
  // 加入当前时间戳和随机数，确保唯一性
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + '-' + Math.random().toString(36).substr(2, 5);
}

// 通用存储函数 - 操作内存变量
function setData<T>(key: string, data: T[]): void {
  if (key === DISHES_KEY) {
    memoryDishes = data as any;
  } else if (key === APPOINTMENTS_KEY) {
    memoryAppointments = data as any;
  } else if (key === INVENTORY_KEY) {
    memoryInventory = data as any;
  }
}

// 通用获取函数 - 从内存变量获取
function getData<T>(key: string): T[] {
  if (key === DISHES_KEY) {
    return memoryDishes as any;
  } else if (key === APPOINTMENTS_KEY) {
    return memoryAppointments as any;
  } else if (key === INVENTORY_KEY) {
    return memoryInventory as any;
  }
  return [] as T[];
}

// 添加辅助函数，处理食材数据
function enhanceIngredient(ingredient: any, dishId: string): any {
  return {
    ...ingredient,
    dishId: dishId,
    createTime: Date.now(),
    updateTime: Date.now()
  };
}

// 添加测试数据
export function initTestData(): void {
  // 如果已经初始化过，不再重复初始化
  if (isInitialized) {
    return;
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
        enhanceIngredient({ id: 'ing1', name: '西红柿', amount: '2个' }, 'test-dish1'),
        enhanceIngredient({ id: 'ing2', name: '鸡蛋', amount: '3个' }, 'test-dish1'),
        enhanceIngredient({ id: 'ing3', name: '葱', amount: '适量' }, 'test-dish1'),
        enhanceIngredient({ id: 'ing4', name: '盐', amount: '适量' }, 'test-dish1')
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
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish2',
      name: '麻婆豆腐',
      type: DishType.Stir,
      spicy: SpicyLevel.Medium,
      images: ['/images/default-dish.png'],
      ingredients: [
        enhanceIngredient({ id: 'ing5', name: '豆腐', amount: '1块' }, 'test-dish2'),
        enhanceIngredient({ id: 'ing6', name: '肉末', amount: '100g' }, 'test-dish2'),
        enhanceIngredient({ id: 'ing7', name: '郫县豆瓣酱', amount: '1勺' }, 'test-dish2'),
        enhanceIngredient({ id: 'ing8', name: '花椒', amount: '少许' }, 'test-dish2'),
        enhanceIngredient({ id: 'ing9', name: '大蒜', amount: '3瓣' }, 'test-dish2')
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
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish3',
      name: '清炒油麦菜',
      type: DishType.Vegetable,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        enhanceIngredient({ id: 'ing10', name: '油麦菜', amount: '1把' }, 'test-dish3'),
        enhanceIngredient({ id: 'ing11', name: '蒜', amount: '2瓣' }, 'test-dish3'),
        enhanceIngredient({ id: 'ing12', name: '盐', amount: '适量' }, 'test-dish3')
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
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish4',
      name: '排骨冬瓜汤',
      type: DishType.Soup,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        enhanceIngredient({ id: 'ing13', name: '排骨', amount: '300g' }, 'test-dish4'),
        enhanceIngredient({ id: 'ing14', name: '冬瓜', amount: '半个' }, 'test-dish4'),
        enhanceIngredient({ id: 'ing15', name: '姜', amount: '3片' }, 'test-dish4'),
        enhanceIngredient({ id: 'ing16', name: '盐', amount: '适量' }, 'test-dish4')
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
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish5',
      name: '水煮鱼',
      type: DishType.Stir,
      spicy: SpicyLevel.Hot,
      images: ['/images/default-dish.png'],
      ingredients: [
        enhanceIngredient({ id: 'ing17', name: '草鱼', amount: '1条' }, 'test-dish5'),
        enhanceIngredient({ id: 'ing18', name: '豆芽', amount: '适量' }, 'test-dish5'),
        enhanceIngredient({ id: 'ing19', name: '干辣椒', amount: '10个' }, 'test-dish5'),
        enhanceIngredient({ id: 'ing20', name: '花椒', amount: '1勺' }, 'test-dish5'),
        enhanceIngredient({ id: 'ing21', name: '郫县豆瓣酱', amount: '2勺' }, 'test-dish5')
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
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish6',
      name: '宫保鸡丁',
      type: DishType.Stir,
      spicy: SpicyLevel.Medium,
      images: ['/images/default-dish.png'],
      ingredients: [
        enhanceIngredient({ id: 'ing22', name: '鸡胸肉', amount: '300g' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing23', name: '花生', amount: '50g' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing24', name: '干辣椒', amount: '8个' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing25', name: '花椒', amount: '适量' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing26', name: '葱', amount: '3根' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing27', name: '姜', amount: '适量' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing28', name: '蒜', amount: '3瓣' }, 'test-dish6'),
        enhanceIngredient({ id: 'ing29', name: '黄瓜', amount: '半根' }, 'test-dish6')
      ],
      steps: [
        '鸡胸肉切成丁，用盐、料酒和淀粉腌制15分钟',
        '黄瓜切丁，葱姜蒜切末',
        '花生米提前炒熟',
        '锅中倒油，放入干辣椒和花椒爆香',
        '加入葱姜蒜末煸炒出香味',
        '倒入鸡丁快速翻炒至变色',
        '加入黄瓜丁翻炒均匀',
        '加入酱油、醋、糖、盐调味',
        '最后加入花生米翻炒均匀即可'
      ],
      notice: '花生米不要炒糊，火候要控制好',
      remark: '经典川菜，酸辣可口',
      reference: '',
      creatorId: '',
      creatorOpenid: '',
      createTime: Date.now(),
      updateTime: Date.now()
    },
    {
      id: 'test-dish7',
      name: '红烧肉',
      type: DishType.Stew,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing30', name: '五花肉', amount: '500g' },
        { id: 'ing31', name: '姜', amount: '5片' },
        { id: 'ing32', name: '葱', amount: '2根' },
        { id: 'ing33', name: '冰糖', amount: '30g' },
        { id: 'ing34', name: '八角', amount: '2个' },
        { id: 'ing35', name: '桂皮', amount: '1小块' },
        { id: 'ing36', name: '料酒', amount: '2勺' },
        { id: 'ing37', name: '老抽', amount: '1勺' }
      ],
      steps: [
        '五花肉切成4厘米见方的块',
        '冷水下锅焯水，去除血水和杂质',
        '锅中放入少许油，加入冰糖小火煸炒至融化呈棕色',
        '放入焯好的五花肉翻炒均匀上色',
        '加入姜片、葱段、八角、桂皮爆香',
        '加入料酒、老抽、生抽调色',
        '加入没过肉的开水，大火烧开后转小火',
        '盖上锅盖炖煮40分钟至肉烂',
        '最后大火收汁即可'
      ],
      notice: '煮的时间要足够长，让肉炖烂',
      remark: '经典家常菜，色香味俱全',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'test-dish8',
      name: '糖醋里脊',
      type: DishType.Stir,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing38', name: '猪里脊肉', amount: '300g' },
        { id: 'ing39', name: '淀粉', amount: '适量' },
        { id: 'ing40', name: '鸡蛋', amount: '1个' },
        { id: 'ing41', name: '白醋', amount: '2勺' },
        { id: 'ing42', name: '白糖', amount: '3勺' },
        { id: 'ing43', name: '番茄酱', amount: '2勺' },
        { id: 'ing44', name: '盐', amount: '适量' }
      ],
      steps: [
        '猪里脊肉切成条状，用盐、料酒、淀粉和蛋清腌制15分钟',
        '锅中倒入油，油温五成热时放入腌好的肉条',
        '炸至金黄色捞出沥油',
        '锅中留少许油，倒入白醋、白糖、番茄酱、盐',
        '小火熬制成浓稠的糖醋汁',
        '放入炸好的肉条快速翻炒均匀即可'
      ],
      notice: '糖醋汁不要熬太久，避免过稠',
      remark: '外酥里嫩，酸甜可口',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'test-dish9',
      name: '鱼香茄子',
      type: DishType.Stir,
      spicy: SpicyLevel.Medium,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing45', name: '长茄子', amount: '2根' },
        { id: 'ing46', name: '肉末', amount: '100g' },
        { id: 'ing47', name: '葱', amount: '2根' },
        { id: 'ing48', name: '姜', amount: '适量' },
        { id: 'ing49', name: '蒜', amount: '3瓣' },
        { id: 'ing50', name: '豆瓣酱', amount: '2勺' },
        { id: 'ing51', name: '白糖', amount: '1勺' },
        { id: 'ing52', name: '醋', amount: '1勺' }
      ],
      steps: [
        '茄子切成条状，用盐水浸泡10分钟去涩',
        '锅中倒油，炸茄子至外酥里软，捞出沥油',
        '锅中留少许油，爆香葱姜蒜',
        '加入肉末炒散',
        '加入豆瓣酱炒出红油',
        '加入白糖、醋、酱油调味',
        '放入炸好的茄子翻炒均匀',
        '勾芡收汁即可'
      ],
      notice: '茄子吸油量大，炸的时候油温要高',
      remark: '鱼香味浓郁，下饭佳品',
      reference: '',
      createTime: Date.now()
    },
    {
      id: 'test-dish10',
      name: '蒜蓉蒸虾',
      type: DishType.Steam,
      spicy: SpicyLevel.None,
      images: ['/images/default-dish.png'],
      ingredients: [
        { id: 'ing53', name: '大虾', amount: '500g' },
        { id: 'ing54', name: '蒜', amount: '1整头' },
        { id: 'ing55', name: '葱', amount: '2根' },
        { id: 'ing56', name: '生姜', amount: '适量' },
        { id: 'ing57', name: '料酒', amount: '1勺' },
        { id: 'ing58', name: '盐', amount: '适量' }
      ],
      steps: [
        '大虾洗净，去虾线',
        '蒜切末，葱切段，姜切丝',
        '将虾摆入盘中，撒上蒜末、姜丝',
        '淋上料酒，撒上少许盐',
        '蒸锅水开后，放入虾，中火蒸7-8分钟',
        '出锅后撒上葱花即可'
      ],
      notice: '蒸虾不要过长时间，以免虾肉老硬',
      remark: '鲜香美味，适合待客',
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
  
  // 直接将测试数据存储到内存中
  setData(DISHES_KEY, testDishes);
  setData(APPOINTMENTS_KEY, testAppointments);
  setData(INVENTORY_KEY, testInventory);
  
  // 标记已初始化
  isInitialized = true;
}

// 菜品相关操作
export const dishService = {
  // 获取所有菜品
  getAllDishes(): Dish[] {
    // 确保数据已初始化
    if (!isInitialized) {
      initTestData();
    }
    
    const dishes = getData<Dish>(DISHES_KEY);
    
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
    
    // 如果有重复项，更新内存中的数据
    if (uniqueDishes.length !== dishes.length) {
      console.warn(`菜品中共有 ${dishes.length - uniqueDishes.length} 个重复项已被移除`);
      setData(DISHES_KEY, uniqueDishes);
      return uniqueDishes;
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
    // 确保数据已初始化
    if (!isInitialized) {
      initTestData();
    }
    
    const appointments = getData<Appointment>(APPOINTMENTS_KEY);
    
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
    
    // 如果有重复项，更新内存中的数据
    if (uniqueAppointments.length !== appointments.length) {
      console.warn(`预约中共有 ${appointments.length - uniqueAppointments.length} 个重复项已被移除`);
      setData(APPOINTMENTS_KEY, uniqueAppointments);
      return uniqueAppointments;
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
    // 确保数据已初始化
    if (!isInitialized) {
      initTestData();
    }
    
    const items = getData<InventoryItem>(INVENTORY_KEY);
    
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
    
    // 如果有重复项，更新内存中的数据
    if (uniqueItems.length !== items.length) {
      console.warn(`库存中共有 ${items.length - uniqueItems.length} 个重复项已被移除`);
      setData(INVENTORY_KEY, uniqueItems);
      return uniqueItems;
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