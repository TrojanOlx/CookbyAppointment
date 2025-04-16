import { InventoryItem } from '../../utils/model';
import { inventoryService, generateId } from '../../utils/storage';
import { showConfirm, showSuccess, showToast, getCurrentDate, isDateExpired, dateDiff } from '../../utils/util';

// 每页加载的数量
const PAGE_SIZE = 10;

interface DisplayInventoryItem extends InventoryItem {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number | null;
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
    allFilteredItems: [] as DisplayInventoryItem[] // 存储全部筛选后的数据
  },

  onLoad() {
    // 初始加载数据
    this.loadInventory(true);
  },

  onShow() {
    // 显示页面时刷新数据
    this.loadInventory(true);
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 3
      });
    }
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
  loadInventory(refresh = false) {
    if (this.data.loading && !this.data.isRefreshing) return;
    
    this.setData({ 
      loading: true,
      isLoadingMore: !refresh && !this.data.isRefreshing
    });
    
    // 只有刷新时才重新获取全部数据
    if (refresh) {
      // 获取所有库存数据
      let inventoryItems = inventoryService.getAllInventory();
      
      // 确保没有重复ID的数据
      const uniqueIds = new Set<string>();
      inventoryItems = inventoryItems.filter(item => {
        if (uniqueIds.has(item.id)) {
          console.warn(`发现重复ID: ${item.id}，已过滤`);
          return false;
        }
        uniqueIds.add(item.id);
        return true;
      });
      
      // 计算各状态计数
      const counts = this.calculateCounts(inventoryItems);
      
      // 根据搜索关键词筛选
      let filteredItems = this.data.searchKeyword 
        ? inventoryService.searchInventoryByName(this.data.searchKeyword).filter(item => uniqueIds.has(item.id))
        : inventoryItems;
      
      // 处理数据，添加过期信息
      const allItems: DisplayInventoryItem[] = [];
      const today = getCurrentDate();
      
      for (const item of filteredItems) {
        const expired = isDateExpired(item.expiryDate);
        let daysLeft = null;
        
        if (!expired) {
          daysLeft = dateDiff(today, item.expiryDate);
        }
        
        const displayItem = {
          ...item,
          isExpired: expired,
          isExpiringSoon: !expired && daysLeft !== null && daysLeft <= 3,
          daysLeft
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
    
    this.loadInventory(true);
  },

  // 按状态筛选
  filterByStatus(e: any) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      filterStatus: status,
      currentPage: 1
    });
    
    this.loadInventory(true);
  },
  
  // 下拉刷新
  onRefresh() {
    if (this.data.isRefreshing) return;
    
    this.setData({
      isRefreshing: true
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
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `./add/add?id=${id}`
    });
  },

  // 删除食材
  async deleteItem(e: any) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await showConfirm('确认删除', '确定要删除这个食材吗？');
    
    if (confirmed) {
      const success = inventoryService.deleteInventory(id);
      if (success) {
        showSuccess('删除成功');
        this.loadInventory(true);
      }
    }
  },
  
  // 下拉刷新
  onPullDownRefresh() {
    this.loadInventory(true);
  },

  // 上拉加载更多
  onReachBottom() {
    // if (this.data.hasMore && !this.data.loading) {
    //   this.loadInventory();
    // }
  }
}); 