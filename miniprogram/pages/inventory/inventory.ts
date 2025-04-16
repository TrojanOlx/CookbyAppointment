import { InventoryItem } from '../../utils/model';
import { inventoryService, generateId } from '../../utils/storage';
import { showConfirm, showSuccess, getCurrentDate, isDateExpired, dateDiff } from '../../utils/util';

interface DisplayInventoryItem extends InventoryItem {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number | null;
}

Page({
  data: {
    items: [] as DisplayInventoryItem[],
    searchKeyword: '',
    pageSize: 10,
    currentPage: 1,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadInventory(true);
  },

  onShow() {
    this.loadInventory(true);
    
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  // 加载库存数据
  loadInventory(refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    // 根据搜索关键词决定获取全部库存还是进行搜索
    const inventoryItems = this.data.searchKeyword 
      ? inventoryService.searchInventoryByName(this.data.searchKeyword)
      : inventoryService.getAllInventory();

    // 处理数据，添加过期信息
    const allItems: DisplayInventoryItem[] = [];
    const today = getCurrentDate();
    
    for (const item of inventoryItems) {
      const expired = isDateExpired(item.expiryDate);
      let daysLeft = null;
      
      if (!expired) {
        daysLeft = dateDiff(today, item.expiryDate);
      }
      
      allItems.push({
        ...item,
        isExpired: expired,
        isExpiringSoon: !expired && daysLeft !== null && daysLeft <= 3,
        daysLeft
      });
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
    
    // 计算分页数据
    const start = refresh ? 0 : (this.data.currentPage - 1) * this.data.pageSize;
    const end = start + this.data.pageSize;
    const items = allItems.slice(start, end);
    
    this.setData({
      items: refresh ? items : [...this.data.items, ...items],
      currentPage: refresh ? 1 : this.data.currentPage + 1,
      hasMore: end < allItems.length,
      loading: false
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
    if (this.data.hasMore && !this.data.loading) {
      this.loadInventory();
    }
  }
}); 