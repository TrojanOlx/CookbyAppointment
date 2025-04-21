import { InventoryItem } from '../../models/inventory';
import { InventoryService } from '../../services/inventoryService';
import { showConfirm, showSuccess, showToast, getCurrentDate, isDateExpired, dateDiff } from '../../utils/util';

// 每页加载的数量
const PAGE_SIZE = 10;

interface DisplayInventoryItem extends InventoryItem {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number | null;
  xmove?: number; // 添加滑动位移属性
}

interface CountInfo {
  totalCount: number;
  normalCount: number;
  expiringCount: number;
  expiredCount: number;
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
    allFilteredItems: [] as DisplayInventoryItem[], // 存储全部筛选后的完整数据
    safeAreaBottom: 0,
    startX: 0 // 添加触摸起始位置
  },

  onLoad() {
    // 初始加载数据
    this.loadInventory(true);
    this.setSafeArea();
  },

  onShow() {
    // 显示页面时刷新数据
    this.loadInventory(true);
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
  
  // 统计各状态的食材数量
  calculateCounts(inventoryItems: InventoryItem[]): CountInfo {
    const today = getCurrentDate();
    let normalCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    
    for (const item of inventoryItems) {
      const expired = isDateExpired(item.expiryDate);
      let daysLeft = null;
      
      if (!expired) {
        daysLeft = dateDiff(today, item.expiryDate);
      }
      
      if (expired) {
        expiredCount++;
      } else if (!expired && daysLeft !== null && daysLeft <= 3) {
        expiringCount++;
      } else {
        normalCount++;
      }
    }
    
    return {
      totalCount: inventoryItems.length,
      normalCount,
      expiringCount,
      expiredCount
    };
  },

  // 加载库存数据
  async loadInventory(refresh = false) {
    if (this.data.loading && !this.data.isRefreshing) return;
    
    this.setData({ 
      loading: true,
      isLoadingMore: !refresh && !this.data.isRefreshing
    });
    
    try {
      // 只有刷新时才重新获取全部数据
      if (refresh) {
        let inventoryItems: InventoryItem[] = [];
        let response;
        
        // 根据搜索关键词获取数据
        if (this.data.searchKeyword) {
          // 使用搜索接口
          response = await InventoryService.searchInventory(
            this.data.searchKeyword, 
            1, 
            100 // 获取较多数据以便本地筛选
          );
          inventoryItems = response.list;
        } else {
          // 获取所有库存数据
          response = await InventoryService.getInventoryList(1, 100); // 获取较多数据以便本地筛选
          inventoryItems = response.list;
        }
        
        // 计算各状态计数
        const counts = this.calculateCounts(inventoryItems);
        
        // 处理数据，添加过期信息
        const allItems: DisplayInventoryItem[] = [];
        const today = getCurrentDate();
        
        // 创建ID映射以处理可能的重复ID
        const usedIds = new Set<string>();
        
        for (const item of inventoryItems) {
          const expired = isDateExpired(item.expiryDate);
          let daysLeft = null;
          
          if (!expired) {
            daysLeft = dateDiff(today, item.expiryDate);
          }
          
          // 确保ID唯一
          let uniqueId = item.id;
          if (usedIds.has(uniqueId)) {
            uniqueId = `${uniqueId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          }
          usedIds.add(uniqueId);
          
          const displayItem = {
            ...item,
            id: uniqueId, // 使用唯一ID
            isExpired: expired,
            isExpiringSoon: !expired && daysLeft !== null && daysLeft <= 3,
            daysLeft,
            xmove: 0 // 添加 xmove 属性
          };
          
          // 根据筛选条件过滤
          if (this.data.filterStatus === '') {
            // 全部
            allItems.push(displayItem);
          } else if (this.data.filterStatus === 'normal' && !displayItem.isExpired && !displayItem.isExpiringSoon) {
            // 未到期（不包括即将过期）
            allItems.push(displayItem);
          } else if (this.data.filterStatus === 'expiring' && displayItem.isExpiringSoon) {
            // 即将过期
            allItems.push(displayItem);
          } else if (this.data.filterStatus === 'expired' && displayItem.isExpired) {
            // 已过期
            allItems.push(displayItem);
          }
        }
        
        // 按过期情况排序：已过期 > 即将过期 > 正常
        allItems.sort((a, b) => {
          if (a.isExpired && !b.isExpired) return -1;
          if (!a.isExpired && b.isExpired) return 1;
          if (a.isExpiringSoon && !b.isExpiringSoon) return -1;
          if (!a.isExpiringSoon && b.isExpiringSoon) return 1;
          
          // 同类按保质期剩余天数或按名称排序
          if (a.daysLeft !== null && b.daysLeft !== null) {
            return a.daysLeft - b.daysLeft;
          }
          return a.name.localeCompare(b.name);
        });
        
        // 保存筛选并排序后的完整数据
        this.setData({
          allFilteredItems: allItems,
          ...counts // 更新各状态计数
        });
      }
      
      // 使用已保存的筛选后数据进行分页
      const filteredTotal = this.data.allFilteredItems.length;
      const start = refresh ? 0 : (this.data.currentPage - 1) * this.data.pageSize;
      const end = start + this.data.pageSize;
      const items = this.data.allFilteredItems.slice(start, end);
      const hasMore = end < filteredTotal;
      
      // 更新数据
      this.setData({
        items: refresh ? items : [...this.data.items, ...items],
        currentPage: refresh ? 1 : this.data.currentPage + 1,
        hasMore,
        filteredTotal,
        loading: false,
        isRefreshing: false,
        isLoadingMore: false
      });
    } catch (error) {
      console.error('加载库存数据失败:', error);
      showToast('加载数据失败，请重试');
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
    this.setData({
      searchKeyword: e.detail.value,
      currentPage: 1
    });
    
    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();
    this.loadInventory(true);
  },

  // 按状态筛选
  filterByStatus(e: any) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      filterStatus: status,
      currentPage: 1
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
    this.loadInventory(true);
  },

  // 添加食材
  addItem() {
    wx.navigateTo({
      url: './add/add'
    });
  },

  // 编辑食材
  editItem(e: any) {
    // 隐藏所有删除按钮
    this.hideAllDeleteButtons();
    
    const id = e.currentTarget.dataset.id;
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
    this.loadInventory(true);
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
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
    items.forEach((item, idx) => {
      items[idx].xmove = 0;
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
    items.forEach((item, index) => {
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