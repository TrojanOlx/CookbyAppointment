import { InventoryCategory, InventoryItem } from '../../models/inventory';
import { InventoryExpiryState, InventoryService } from '../../services/inventoryService';
import { showConfirm, showSuccess, showToast, showLoading, hideLoading, getCurrentDate, formatDate, isDateExpired, dateDiff } from '../../utils/util';
import { ImageCacheService } from '../../utils/imageCache';
const { FamilyService } = require('../../services/family');

// 服务端分页大小，避免一次拉取整组库存后再在客户端过滤。
const PAGE_SIZE = 20;
const EXPIRING_DAYS = 3;
let inventoryRequestId = 0;

interface DisplayInventoryItem extends InventoryItem {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number | null;
  xmove?: number; // 添加滑动位移属性
  cachedImage?: string;
}

Page({
  data: {
    items: [] as DisplayInventoryItem[],
    searchKeyword: '',
    filterStatus: '', // 空字符串表示全部，'normal' 表示未到期，'expiring' 表示即将过期，'expired' 表示已过期
    pageSize: PAGE_SIZE,
    currentPage: 1,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    isLoadingMore: false,
    filteredTotal: 0,
    totalCount: 0,    // 总数量
    normalCount: 0,   // 未到期数量
    expiringCount: 0, // 即将过期数量
    expiredCount: 0,   // 已过期数量
    safeAreaBottom: 0,
    startX: 0 // 添加触摸起始位置
  },

  searchTimer: null as number | null,
  hasShown: false,
  wasHidden: false,
  lastFamilyId: '',
  pendingReturnRefresh: false,

  onLoad() {
    this.lastFamilyId = String(FamilyService.getActiveFamilyId() || '');
    this.loadInventory(true);
    this.setSafeArea();
  },

  onShow() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    const isInitialShow = !this.hasShown;
    const familyChanged = Boolean(this.lastFamilyId) && familyId !== this.lastFamilyId;
    this.hasShown = true;
    this.lastFamilyId = familyId;

    // onLoad 已负责首次加载；返回页面或切换家庭时交给 service 的会话缓存决定是否真正发请求。
    if (!isInitialShow && (this.wasHidden || familyChanged || this.pendingReturnRefresh)) {
      this.pendingReturnRefresh = false;
      this.loadInventory(true, false, true);
    }
    this.wasHidden = false;
  },

  onHide() {
    this.wasHidden = true;
  },

  onUnload() {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    inventoryRequestId += 1;
  },

  // 设置安全区域
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

  // 处理安全区域数据
  processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
    const safeAreaBottom = systemInfo.safeArea ?
      (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;

    this.setData({
      safeAreaBottom
    });
  },

  onItemImageError(e: WechatMiniprogram.TouchEvent) {
    const itemId = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const index = itemId
      ? this.data.items.findIndex(item => String(item.id) === itemId)
      : fallbackIndex;
    if (index < 0 || index >= this.data.items.length) return;
    if (this.data.items[index].cachedImage === '/images/default-dish.jpg') return;
    this.setData({ [`items[${index}].cachedImage`]: '/images/default-dish.jpg' });
  },

  // 加载库存数据。刷新只重置页码，force 仅由用户显式下拉时使用。
  async loadInventory(refresh = false, force = false, silent = false) {
    if (!refresh && (this.data.loading || this.data.isRefreshing || this.data.isLoadingMore)) return;
    if (!refresh && !this.data.hasMore) return;

    const requestId = ++inventoryRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    const isCurrentRequest = () => requestId === inventoryRequestId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === String(FamilyService.getActiveFamilyId() || '')
      && searchKeyword === this.data.searchKeyword
      && filterStatus === this.data.filterStatus;
    const searchKeyword = this.data.searchKeyword;
    const filterStatus = this.data.filterStatus as InventoryExpiryState | '';
    const page = refresh ? 1 : this.data.currentPage;

    this.setData({
      loading: true,
      isLoadingMore: !refresh && !this.data.isRefreshing
    });

    try {
      const response = await InventoryService.listInventory({
        page,
        pageSize: PAGE_SIZE,
        keyword: searchKeyword.trim() || undefined,
        expiryState: filterStatus || undefined,
        expiringDays: EXPIRING_DAYS,
      }, force);
      if (!isCurrentRequest()) return;

      const today = getCurrentDate();
      const items: DisplayInventoryItem[] = response.list.map(item => {
        const isExpired = isDateExpired(item.expiryDate);
        const daysLeft = isExpired ? null : dateDiff(today, item.expiryDate);
        return {
          ...item,
          isExpired,
          isExpiringSoon: !isExpired && daysLeft !== null && daysLeft <= EXPIRING_DAYS,
          daysLeft,
          xmove: 0,
        };
      });
      const cachedItems = await ImageCacheService.withCachedImages(
        items,
        item => item.image,
        'cachedImage',
        {
          getIdentity: () => ({ familyId }),
          onResolved: updates => {
            if (!isCurrentRequest()) return;
            const patch: Record<string, string> = {};
            updates.forEach(update => {
              const item = items[update.index];
              if (!item) return;
              const index = this.data.items.findIndex(current => String(current.id) === String(item.id));
              if (index >= 0) patch[`items[${index}].${update.field}`] = update.value;
            });
            if (Object.keys(patch).length) this.setData(patch);
          }
        }
      );
      if (!isCurrentRequest()) return;

      const summary = response.summary || { total: response.total, normal: 0, expiring: 0, expired: 0 };
      this.setData({
        items: refresh ? cachedItems : [...this.data.items, ...cachedItems],
        currentPage: (response.page || page) + 1,
        hasMore: response.hasMore,
        filteredTotal: response.total,
        totalCount: summary.total,
        normalCount: summary.normal,
        expiringCount: summary.expiring,
        expiredCount: summary.expired,
        loading: false,
        isRefreshing: false,
        isLoadingMore: false
      });
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('加载库存数据失败:', error);
      if (!silent) showToast('加载数据失败，请重试');
      this.setData({
        loading: false,
        isRefreshing: false,
        isLoadingMore: false
      });
    }

    if (refresh && wx.stopPullDownRefresh) {
      wx.stopPullDownRefresh();
    }
  },

  // 搜索输入
  onSearchInput(e: any) {
    inventoryRequestId += 1;
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const searchKeyword = String(e.detail.value || '');
    this.setData({
      searchKeyword,
      currentPage: 1,
      items: [],
      filteredTotal: 0,
      hasMore: true
    });

    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.loadInventory(true);
    }, 250) as unknown as number;
  },

  // 按状态筛选
  filterByStatus(e: any) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      filterStatus: status,
      currentPage: 1,
      items: [],
      filteredTotal: 0,
      hasMore: true
    });

    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();
    this.loadInventory(true);
  },

  // 刷新事件
  onRefresh() {
    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();

    this.setData({
      isRefreshing: true,
      currentPage: 1
    });
    this.loadInventory(true, true);
  },

  // 添加食材
  addItem() {
    this.pendingReturnRefresh = true;
    wx.navigateTo({
      url: './add/add'
    });
  },

  async seedTestInventory() {
    if (this.data.totalCount > 0) {
      showToast('已有库存数据');
      return;
    }

    const dateByOffset = (offset: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return formatDate(date);
    };

    const sampleItems: Partial<InventoryItem>[] = [
      { name: '鸡蛋', amount: '10个', category: InventoryCategory.Dairy, putInDate: dateByOffset(-2), expiryDate: dateByOffset(10), image: '/images/default-dish.jpg' },
      { name: '西红柿', amount: '5个', category: InventoryCategory.Vegetable, putInDate: dateByOffset(-1), expiryDate: dateByOffset(6), image: '/images/default-dish.jpg' },
      { name: '豆腐', amount: '2块', category: InventoryCategory.Other, putInDate: dateByOffset(-1), expiryDate: dateByOffset(2), image: '/images/default-dish.jpg' },
      { name: '排骨', amount: '500g', category: InventoryCategory.Meat, putInDate: dateByOffset(-3), expiryDate: dateByOffset(1), image: '/images/default-dish.jpg' },
      { name: '油麦菜', amount: '1把', category: InventoryCategory.Vegetable, putInDate: dateByOffset(-2), expiryDate: dateByOffset(0), image: '/images/default-dish.jpg' },
      { name: '葱', amount: '5根', category: InventoryCategory.Vegetable, putInDate: dateByOffset(-6), expiryDate: dateByOffset(-1), image: '/images/default-dish.jpg' },
      { name: '牛肉', amount: '300g', category: InventoryCategory.Meat, putInDate: dateByOffset(-1), expiryDate: dateByOffset(3), image: '/images/default-dish.jpg' },
      { name: '大米', amount: '5kg', category: InventoryCategory.Grain, putInDate: dateByOffset(-60), expiryDate: dateByOffset(300), image: '/images/default-dish.jpg' }
    ];

    showLoading('添加示例中');
    try {
      await Promise.all(sampleItems.map(item => InventoryService.addInventory(item)));
      hideLoading();
      showSuccess('示例库存已添加');
      this.loadInventory(true);
    } catch (error) {
      hideLoading();
      showToast('添加示例失败，请重试');
    }
  },

  // 编辑食材
  editItem(e: any) {
    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();

    const id = e.currentTarget.dataset.id;
    this.pendingReturnRefresh = true;
    wx.navigateTo({
      url: `/pages/inventory/add/add?id=${id}`
    });
  },

  // 删除食材
  async deleteItem(e: any) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await showConfirm('确认删除', '确定要删除这个食材吗？');

    if (confirmed) {
      try {
        const result = await InventoryService.deleteInventory(id);
        if (result.success) {
          showSuccess('删除成功');
          this.loadInventory(true);
        } else {
          showToast('删除失败');
        }
      } catch (error) {
        console.error('删除库存失败:', error);
        showToast('删除失败，请重试');
      }
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadInventory(true, true);
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.isLoadingMore) {
      this.loadInventory();
    }
  },

  /**
   * 处理touchstart事件
   */
  handleTouchStart(e: WechatMiniprogram.TouchEvent) {
    this.data.startX = e.touches[0].pageX;
  },

  /**
   * 处理touchend事件
   */
  handleTouchEnd(e: WechatMiniprogram.TouchEvent) {
    const deltaX = e.changedTouches[0].pageX - this.data.startX;

    // 左滑超过30px，显示删除按钮
    if (deltaX < -30) {
      this.showDeleteButton(e);
    }
    // 右滑超过15px，隐藏删除按钮
    else if (deltaX > 15) {
      this.hideDeleteButton(e);
    }
    // 其它小幅度滑动，根据当前状态决定
    else {
      const index = (e.currentTarget as any).dataset.index;
      const currentXmove = this.data.items[index].xmove || 0;

      // 如果当前已经显示删除按钮，保持显示；否则隐藏
      if (currentXmove < -30) {
        this.showDeleteButton(e);
      } else {
        this.hideDeleteButton(e);
      }
    }
  },

  /**
   * 显示删除按钮
   */
  showDeleteButton(e: WechatMiniprogram.TouchEvent) {
    const index = (e.currentTarget as any).dataset.index;

    // 先重置所有项目的xmove为0
    const items = [...this.data.items];
    items.forEach(item => {
      item.xmove = 0;
    });

    // 然后只设置当前项目的xmove为-85
    items[index].xmove = -85;

    this.setData({
      items
    });
  },

  /**
   * 隐藏删除按钮
   */
  hideDeleteButton(e: WechatMiniprogram.TouchEvent) {
    const index = (e.currentTarget as any).dataset.index;
    this.setXmove(index, 0);
  },

  /**
   * 设置movable-view位移
   */
  setXmove(index: number, xmove: number) {
    const items = [...this.data.items];
    items[index].xmove = xmove;
    this.setData({
      items
    });
  },

  /**
   * 处理movable-view移动事件
   */
  handleMovableChange(e: any) {
    if (e.detail.source === 'touch') {
      // 用户正在触摸滑动，不做额外处理
      return;
    }

    if (e.detail.source === 'friction' || e.detail.source === 'out-of-bounds') {
      // 当是惯性滑动或者超出边界时
      if (e.detail.x < -30) {
        // 如果滑动距离超过阈值，显示删除按钮
        this.showDeleteButton(e);
      } else if (e.detail.source === 'out-of-bounds' && e.detail.x === 0) {
        // 如果是由于边界弹回导致的位置改变，隐藏删除按钮
        this.hideDeleteButton(e);
      } else if (Math.abs(e.detail.x) < 15) {
        // 如果滑动距离较小，隐藏删除按钮
        this.hideDeleteButton(e);
      }
    }
  },

  /**
   * 隐藏所有删除按钮
   */
  hideAllDeleteButtons() {
    const items = [...this.data.items];
    items.forEach(item => {
      item.xmove = 0;
    });
    this.setData({
      items
    });
  },

  /**
   * 容器点击事件，用于隐藏所有删除按钮
   */
  onContainerTap() {
    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();
  },

  /**
   * 阻止事件冒泡
   */
  stopEvent() {
    // 什么都不做，仅阻止事件冒泡
  },

  /**
   * 处理滚动事件
   */
  onScroll() {
    // 滚动时隐藏所有删除按钮
    this.hideAllDeleteButtons();
  },
});
