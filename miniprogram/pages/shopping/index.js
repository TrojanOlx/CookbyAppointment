const shoppingService = require('../../services/shopping');
const shoppingModel = require('../../models/shopping');

let shoppingListRequestId = 0;

let FamilyService = null;
try {
  FamilyService = require('../../services/family').FamilyService;
} catch (error) {
  // 家庭模块按需发布；没有成员接口时仍允许添加和购买清单项。
  FamilyService = null;
}

function showError(error, fallback) {
  const message = error && error.message ? error.message : fallback;
  wx.showToast({ title: String(message || fallback), icon: 'none' });
}

function toDisplayItem(item, members) {
  const quantity = item.quantity === undefined || item.quantity === null ? '' : String(item.quantity);
  const unit = item.unit ? String(item.unit) : '';
  const assignedMember = (members || []).find(member => String(member.userId) === String(item.assigneeId || ''));
  const assigneeName = item.assigneeName || (assignedMember && assignedMember.nickName) || '';
  return {
    ...item,
    quantityLabel: quantity || unit ? `${quantity}${unit}` : '按需',
    sourceLabel: item.sourceType === 'appointment' || item.sourceType === '预约' ? '预约生成' : '手动添加',
    assigneeName,
    assigneeLabel: assigneeName || '未分配',
    assigneeInitial: assigneeName ? String(assigneeName).slice(0, 1) : '?',
    statusLabel: item.stockedAt ? '已入库' : '待入库',
    selectedForStock: false
  };
}

function normalizeMember(member) {
  const source = member || {};
  const id = source.userId || source.user_id || source.id || '';
  if (!id) return null;
  return {
    ...source,
    userId: String(id),
    nickName: String(source.nickName || source.nickname || source.nick_name || source.name || '家庭成员'),
    avatarUrl: source.avatarUrl || source.avatar_url || source.avatar || ''
  };
}

Page({
  data: {
    familyId: '',
    familyName: '家庭采购清单',
    hasFamily: false,
    hasToken: false,
    loading: false,
    loadError: '',
    refreshing: false,
    items: [],
    activeItems: [],
    purchasedItems: [],
    activeCount: 0,
    purchasedCount: 0,
    selectedStockIds: [],
    activeTab: 'active',
    members: [],
    showAdd: false,
    adding: false,
    form: {
      name: '',
      quantity: '',
      unit: '',
      note: ''
    },
    showRecalculate: false,
    recalculating: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '家庭采购' });
    this.setData({
      hasToken: !!shoppingService.getToken()
    });
    this.loadMembers();
    this.loadList();
  },

  onShow() {
    const familyId = String(shoppingService.getActiveFamilyId() || '');
    const hasToken = !!shoppingService.getToken();
    if (familyId !== this.data.familyId || hasToken !== this.data.hasToken) {
      shoppingListRequestId += 1;
      this.setData({
        familyId,
        hasFamily: !!familyId,
        hasToken,
        loadError: '',
        items: [],
        activeItems: [],
        purchasedItems: [],
        activeCount: 0,
        purchasedCount: 0,
        selectedStockIds: []
      });
      this.loadMembers();
      this.loadList();
    }
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    Promise.all([this.loadList(), this.loadMembers()]).finally(() => {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  async loadMembers() {
    const familyId = String(shoppingService.getActiveFamilyId() || '');
    if (!this.data.hasToken || !familyId) {
      this.setData({ members: [] });
      return;
    }
    try {
      if (FamilyService && typeof FamilyService.members === 'function') {
        const members = await FamilyService.members();
        if (String(shoppingService.getActiveFamilyId() || '') !== familyId) return;
        const normalized = (Array.isArray(members) ? members : []).map(normalizeMember).filter(Boolean);
        if (normalized.length) {
          this.setData({ members: normalized });
          this.refreshAssigneeNames(normalized);
          return;
        }
      }
    } catch (error) {
      if (String(shoppingService.getActiveFamilyId() || '') !== familyId) return;
      console.warn('获取家庭成员失败:', error);
    }

    // 成员接口不可用时，至少允许当前用户给自己分配采购项。
    const userInfo = wx.getStorageSync('userInfo') || {};
    const current = normalizeMember({
      userId: userInfo.id || userInfo.userId || userInfo.openid,
      nickName: userInfo.nickName || userInfo.nickname || '我',
      avatarUrl: userInfo.avatarUrl || ''
    });
    const fallbackMembers = current ? [current] : [];
    if (String(shoppingService.getActiveFamilyId() || '') !== familyId) return;
    this.setData({ members: fallbackMembers });
    this.refreshAssigneeNames(fallbackMembers);
  },

  refreshAssigneeNames(members) {
    if (!this.data.items.length) return;
    const selectedStockIds = this.data.selectedStockIds;
    const items = this.data.items.map(item => ({
      ...toDisplayItem(item, members),
      selectedForStock: selectedStockIds.indexOf(item.id) >= 0
    }));
    const activeItems = items.filter(item => !shoppingModel.isPurchasedItem(item));
    const purchasedItems = items.filter(item => shoppingModel.isPurchasedItem(item));
    this.setData({ items, activeItems, purchasedItems });
  },

  async loadList() {
    const familyId = String(shoppingService.getActiveFamilyId() || '');
    const hasToken = !!shoppingService.getToken();
    const requestId = ++shoppingListRequestId;
    this.setData({ familyId, hasFamily: !!familyId, hasToken, loadError: '' });
    if (!familyId || !hasToken) {
      this.setData({ items: [], activeItems: [], purchasedItems: [], activeCount: 0, purchasedCount: 0, loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      const response = await shoppingService.getShoppingList('active');
      const currentFamilyId = String(shoppingService.getActiveFamilyId() || '');
      if (requestId !== shoppingListRequestId || currentFamilyId !== familyId) return;
      const normalized = shoppingModel.normalizeShoppingListResponse(response);
      const selectedStockIds = this.data.selectedStockIds;
      const items = normalized.items.map(item => {
        const displayItem = toDisplayItem(item, this.data.members);
        return { ...displayItem, selectedForStock: selectedStockIds.indexOf(displayItem.id) >= 0 };
      });
      const activeItems = items.filter(item => !shoppingModel.isPurchasedItem(item));
      const purchasedItems = items.filter(item => shoppingModel.isPurchasedItem(item));
      this.setData({
        items,
        activeItems,
        purchasedItems,
        activeCount: activeItems.length,
        purchasedCount: purchasedItems.length,
        familyName: normalized.familyName || this.data.familyName,
        selectedStockIds: selectedStockIds.filter(id => purchasedItems.some(item => item.id === id && !item.stockedAt))
      });
    } catch (error) {
      const currentFamilyId = String(shoppingService.getActiveFamilyId() || '');
      if (requestId !== shoppingListRequestId || currentFamilyId !== familyId) return;
      console.error('加载采购清单失败:', error);
      this.setData({ loadError: error && error.message ? error.message : '采购清单加载失败，请稍后重试。' });
      showError(error, '加载采购清单失败');
    } finally {
      const currentFamilyId = String(shoppingService.getActiveFamilyId() || '');
      if (requestId === shoppingListRequestId && currentFamilyId === familyId) this.setData({ loading: false });
    }
  },

  retryList() {
    this.loadList();
  },

  setTab(event) {
    const tab = event.currentTarget.dataset.tab;
    this.setData({ activeTab: tab === 'purchased' ? 'purchased' : 'active' });
  },

  openAdd() {
    if (!this.data.hasToken) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.data.hasFamily) {
      wx.showToast({ title: '请先选择一个家庭', icon: 'none' });
      return;
    }
    this.setData({
      showAdd: true,
      form: { name: '', quantity: '', unit: '', note: '' }
    });
  },

  closeAdd() {
    if (!this.data.adding) this.setData({ showAdd: false });
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  stopPropagation() {},

  async submitAdd() {
    const form = this.data.form;
    const name = String(form.name || '').trim();
    const quantityText = String(form.quantity || '').trim();
    const unit = String(form.unit || '').trim();
    const quantity = quantityText ? Number(quantityText) : undefined;
    if (!name) {
      wx.showToast({ title: '请输入食材名称', icon: 'none' });
      return;
    }
    if (quantityText && (!Number.isFinite(quantity) || quantity < 0)) {
      wx.showToast({ title: '请输入有效数量', icon: 'none' });
      return;
    }
    if ((quantityText && !unit) || (!quantityText && unit)) {
      wx.showToast({ title: '数量和单位请一起填写', icon: 'none' });
      return;
    }
    this.setData({ adding: true });
    wx.showLoading({ title: '添加中' });
    try {
      await shoppingService.addShoppingItem({
        name,
        quantity,
        unit: unit || undefined,
        note: String(form.note || '').trim() || undefined
      });
      wx.showToast({ title: '已加入清单', icon: 'success' });
      this.setData({ showAdd: false });
      await this.loadList();
    } catch (error) {
      console.error('添加采购项失败:', error);
      showError(error, '添加失败');
    } finally {
      wx.hideLoading();
      this.setData({ adding: false });
    }
  },

  async toggleChecked(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find(entry => entry.id === id);
    if (!item || item.stockedAt) return;
    const checked = !item.checked;
    wx.showLoading({ title: checked ? '标记已购' : '移回清单' });
    try {
      await shoppingService.updateShoppingItem({ id, checked });
      await this.loadList();
    } catch (error) {
      console.error('更新采购状态失败:', error);
      showError(error, '更新失败');
    } finally {
      wx.hideLoading();
    }
  },

  async assignItem(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const members = this.data.members || [];
    if (!members.length) {
      wx.showToast({ title: '暂无可分配的家庭成员', icon: 'none' });
      return;
    }
    const itemList = members.map(member => member.nickName).concat(['取消分配']);
    wx.showActionSheet({
      itemList,
      success: async (result) => {
        const selected = result.tapIndex === members.length ? null : members[result.tapIndex];
        wx.showLoading({ title: '保存中' });
        try {
          await shoppingService.updateShoppingItem({
            id,
            assigneeId: selected ? selected.userId : ''
          });
          await this.loadList();
        } catch (error) {
          console.error('分配采购人失败:', error);
          showError(error, '分配失败');
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  deleteItem(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除采购项',
      content: '确定从家庭清单中删除它吗？',
      confirmText: '删除',
      confirmColor: '#e05a5a',
      success: async (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: '删除中' });
        try {
          await shoppingService.deleteShoppingItem(id);
          await this.loadList();
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (error) {
          console.error('删除采购项失败:', error);
          showError(error, '删除失败');
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  toggleStockSelection(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.purchasedItems.find(entry => entry.id === id);
    if (!item || item.stockedAt) return;
    const selected = this.data.selectedStockIds.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    const selectedSet = selected;
    this.setData({
      selectedStockIds: selectedSet,
      items: this.data.items.map(entry => ({ ...entry, selectedForStock: selectedSet.indexOf(entry.id) >= 0 })),
      purchasedItems: this.data.purchasedItems.map(entry => ({ ...entry, selectedForStock: selectedSet.indexOf(entry.id) >= 0 }))
    });
  },

  confirmStockIn() {
    const itemIds = this.data.selectedStockIds.slice();
    if (!itemIds.length) {
      wx.showToast({ title: '请先选择要入库的食材', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认入库',
      content: `将 ${itemIds.length} 项食材加入库存，已购标记会保留。`,
      confirmText: '确认入库',
      success: async (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: '入库中' });
        try {
          await shoppingService.stockInShoppingItems(itemIds);
          this.setData({ selectedStockIds: [] });
          await this.loadList();
          wx.showToast({ title: '已完成入库', icon: 'success' });
        } catch (error) {
          console.error('采购入库失败:', error);
          showError(error, '入库失败');
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  openRecalculate() {
    if (!this.data.hasToken) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.data.hasFamily) {
      wx.showToast({ title: '请先选择一个家庭', icon: 'none' });
      return;
    }
    this.setData({ showRecalculate: true });
  },

  closeRecalculate() {
    if (!this.data.recalculating) this.setData({ showRecalculate: false });
  },

  async submitRecalculate() {
    this.setData({ recalculating: true });
    wx.showLoading({ title: '重新计算中' });
    try {
      await shoppingService.recalculateShoppingList();
      this.setData({ showRecalculate: false });
      await this.loadList();
      wx.showToast({ title: '采购清单已重新计算', icon: 'success' });
    } catch (error) {
      console.error('重新计算采购清单失败:', error);
      showError(error, '重新计算失败');
    } finally {
      wx.hideLoading();
      this.setData({ recalculating: false });
    }
  }
});
