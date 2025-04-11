import { Dish, DishType, SpicyLevel } from '../../utils/model';
import { dishService, generateId } from '../../utils/storage';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dishes: [] as Dish[],
    selectedType: '' // 空字符串表示全部类型
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.initTestData(); // 初始化测试数据
    this.loadDishes();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时重新加载数据，以获取最新数据
    this.loadDishes();
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  /**
   * 加载菜品数据
   */
  loadDishes() {
    let dishes: Dish[];
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
   * 初始化测试数据
   */
  initTestData() {
    const dishes = dishService.getAllDishes();
    if (dishes.length === 0) {
      // 添加测试数据
      const testDishes: Dish[] = [
        {
          id: generateId(),
          name: '宫保鸡丁',
          type: DishType.Stir,
          spicy: SpicyLevel.Medium,
          images: [],
          ingredients: [
            { id: generateId(), name: '鸡胸肉', amount: '300克' },
            { id: generateId(), name: '花生', amount: '50克' },
            { id: generateId(), name: '干辣椒', amount: '10个' },
            { id: generateId(), name: '葱姜蒜', amount: '适量' }
          ],
          steps: [
            '鸡肉切丁并用盐、料酒腌制15分钟',
            '花生提前炒熟备用',
            '热锅冷油，放入干辣椒爆香',
            '加入鸡丁翻炒至变色',
            '加入调料和花生翻炒均匀即可'
          ],
          notice: '不要把辣椒炒糊',
          remark: '经典川菜',
          reference: '',
          createTime: Date.now()
        },
        {
          id: generateId(),
          name: '清炒小白菜',
          type: DishType.Vegetable,
          spicy: SpicyLevel.None,
          images: [],
          ingredients: [
            { id: generateId(), name: '小白菜', amount: '300克' },
            { id: generateId(), name: '大蒜', amount: '3瓣' },
            { id: generateId(), name: '食用油', amount: '适量' },
            { id: generateId(), name: '盐', amount: '适量' }
          ],
          steps: [
            '小白菜洗净切段',
            '热锅下油，爆香蒜末',
            '放入小白菜快速翻炒',
            '加盐调味即可'
          ],
          notice: '翻炒时间不要太长，保持菜的脆嫩',
          remark: '清淡爽口',
          reference: '',
          createTime: Date.now() - 3600000
        },
        {
          id: generateId(),
          name: '番茄牛肉汤',
          type: DishType.Soup,
          spicy: SpicyLevel.None,
          images: [],
          ingredients: [
            { id: generateId(), name: '牛肉', amount: '200克' },
            { id: generateId(), name: '番茄', amount: '2个' },
            { id: generateId(), name: '洋葱', amount: '半个' },
            { id: generateId(), name: '胡萝卜', amount: '1根' }
          ],
          steps: [
            '牛肉切块焯水',
            '番茄切块，洋葱和胡萝卜切片',
            '锅中加水，放入牛肉、番茄和蔬菜',
            '大火煮开后转小火炖煮1小时',
            '加盐和香菜调味'
          ],
          notice: '炖煮时间要足够长，牛肉才会炖烂',
          remark: '营养丰富',
          reference: '',
          createTime: Date.now() - 7200000
        },
        {
          id: generateId(),
          name: '麻婆豆腐',
          type: DishType.Stir,
          spicy: SpicyLevel.Hot,
          images: [],
          ingredients: [
            { id: generateId(), name: '豆腐', amount: '1块' },
            { id: generateId(), name: '猪肉末', amount: '100克' },
            { id: generateId(), name: '郫县豆瓣酱', amount: '1勺' },
            { id: generateId(), name: '花椒', amount: '适量' }
          ],
          steps: [
            '豆腐切块焯水',
            '锅中放油，爆香肉末',
            '加入豆瓣酱炒出香味',
            '加入豆腐和适量水',
            '勾芡，撒上花椒粉即可'
          ],
          notice: '注意火候，不要把豆腐煮散',
          remark: '川菜经典',
          reference: '',
          createTime: Date.now() - 10800000
        }
      ];
      
      for (const dish of testDishes) {
        dishService.addDish(dish);
      }
      
      console.log('已添加测试菜品数据');
    }
  },

  /**
   * 选择类型
   */
  selectType(e: any) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      selectedType: type
    });
    this.loadDishes();
  },

  /**
   * 跳转到菜品详情页
   */
  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `./detail/detail?id=${id}`
    });
  },

  /**
   * 跳转到添加菜品页
   */
  goToAdd() {
    wx.navigateTo({
      url: './add/add'
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadDishes();
    wx.stopPullDownRefresh();
  }
}); 