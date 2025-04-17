import { Dish, DishType, SpicyLevel } from '../../utils/model';
import { dishService, generateId } from '../../utils/storage';

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dishes: [] as Dish[],
    selectedType: '', // 空字符串表示全部类型
    dishTypes: [] as string[], // 菜品类型列表
    pageSize: 10,
    currentPage: 1,
    hasMore: true,
    loading: false,
    safeAreaBottom: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 初始化菜品类型
    this.setData({
      dishTypes: Object.values(DishType)
    });
    
    this.initTestData(); // 初始化测试数据
    this.loadDishes(true);
    this.setSafeArea();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时重新加载数据，以获取最新数据
    this.loadDishes(true);
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  /**
   * 设置安全区域
   */
  setSafeArea() {
    const app = getApp<IAppOption>();
    const systemInfo = (app.globalData as any).systemInfo;
    if (systemInfo) {
      // 如果已有系统信息
      this.processSafeArea(systemInfo);
    } else {
      // 重新获取系统信息
      wx.getSystemInfo({
        success: (res) => {
          this.processSafeArea(res);
        }
      });
    }
  },

  /**
   * 处理安全区域数据
   */
  processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
    const safeAreaBottom = systemInfo.safeArea ? 
      (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;
    
    this.setData({
      safeAreaBottom
    });
  },

  /**
   * 加载菜品数据
   */
  loadDishes(refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    let allDishes: Dish[];
    if (this.data.selectedType) {
      allDishes = dishService.getDishesByType(this.data.selectedType);
    } else {
      allDishes = dishService.getAllDishes();
    }
    
    // 按创建时间逆序排列，最新创建的排在前面
    allDishes.sort((a, b) => b.createTime - a.createTime);
    
    // 计算分页数据
    const start = refresh ? 0 : (this.data.currentPage - 1) * this.data.pageSize;
    const end = start + this.data.pageSize;
    const dishes = allDishes.slice(start, end);
    
    this.setData({
      dishes: refresh ? dishes : [...this.data.dishes, ...dishes],
      currentPage: refresh ? 1 : this.data.currentPage + 1,
      hasMore: end < allDishes.length,
      loading: false
    });

    if (refresh && wx.stopPullDownRefresh) {
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 初始化测试数据
   */
  initTestData() {
    const dishes = dishService.getAllDishes();
    if (dishes.length === 0) {
      // 生成更多测试数据
      const dishNames = [
        { 
          name: '宫保鸡丁', 
          type: DishType.Stir, 
          spicy: SpicyLevel.Medium,
          images: [
            '/images/dishImages/gbjd/gbjd1.jpeg'
          ]
        },
        { 
          name: '清炒小白菜', 
          type: DishType.Vegetable, 
          spicy: SpicyLevel.None,
          images: [
            '/images/dishImages/qcxbc/qcxbc1.jpeg',
            '/images/dishImages/qcxbc/qcxbc2.jpeg'
          ]
        },
        { 
          name: '番茄牛肉汤', 
          type: DishType.Soup, 
          spicy: SpicyLevel.None,
          images: [
            '/images/dishImages/fqnrt/fqnrt1.jpeg'
          ]
        },
        { name: '麻婆豆腐', type: DishType.Stir, spicy: SpicyLevel.Hot },
        { name: '水煮鱼', type: DishType.Stir, spicy: SpicyLevel.Hot },
        { name: '青椒土豆丝', type: DishType.Vegetable, spicy: SpicyLevel.Mild },
        { name: '紫菜蛋花汤', type: DishType.Soup, spicy: SpicyLevel.None },
        { name: '辣子鸡', type: DishType.Stir, spicy: SpicyLevel.Hot },
        { name: '炝炒油菜', type: DishType.Vegetable, spicy: SpicyLevel.Mild },
        { name: '排骨汤', type: DishType.Soup, spicy: SpicyLevel.None },
        { name: '鱼香肉丝', type: DishType.Stir, spicy: SpicyLevel.Medium },
        { name: '炒空心菜', type: DishType.Vegetable, spicy: SpicyLevel.None },
        { name: '玉米排骨汤', type: DishType.Soup, spicy: SpicyLevel.None },
        { name: '回锅肉', type: DishType.Stir, spicy: SpicyLevel.Medium },
        { name: '上汤娃娃菜', type: DishType.Vegetable, spicy: SpicyLevel.None }
      ];

      // 为每个菜品生成测试数据
      const testDishes = dishNames.map((item, index) => ({
        id: generateId(),
        name: item.name,
        type: item.type,
        spicy: item.spicy,
        images: item.images || [],
        ingredients: [
          { id: generateId(), name: '主料', amount: '300克' },
          { id: generateId(), name: '配料', amount: '适量' }
        ],
        steps: [
          '准备食材',
          '加工处理',
          '烹饪完成'
        ],
        notice: '注意事项',
        remark: '备注信息',
        reference: '',
        createTime: Date.now() - index * 3600000 // 每个菜品间隔1小时
      }));
      
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
      selectedType: type,
      currentPage: 1,
      dishes: []
    });
    this.loadDishes(true);
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
    this.loadDishes(true);
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadDishes();
    }
  }
}); 