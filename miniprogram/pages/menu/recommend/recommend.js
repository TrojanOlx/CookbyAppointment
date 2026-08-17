const { request } = require('../../../services/http');
const { FamilyService } = require('../../../services/family');

let recommendationRequestId = 0;

Page({
  data: {
    familyId: '',
    loading: false,
    loadError: '',
    members: [],
    selectedDinerIds: [],
    recommendations: []
  },

  async onLoad() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    if (!familyId) {
      wx.showModal({
        title: '请选择家庭',
        content: '冰箱推荐只使用当前家庭的菜谱和库存。',
        showCancel: false,
        success: () => wx.navigateTo({ url: '/pages/family/index/index' })
      });
      return;
    }
    this.setData({ familyId });
    if (await this.loadMembers()) await this.loadRecommendations();
  },

  async onShow() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    if (familyId === this.data.familyId) return;
    recommendationRequestId += 1;
    this.setData({ familyId, members: [], selectedDinerIds: [], recommendations: [], loadError: '', loading: false });
    if (familyId && await this.loadMembers()) await this.loadRecommendations();
  },

  async loadMembers() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    try {
      const members = await FamilyService.members();
      if (familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return false;
      this.setData({ members, selectedDinerIds: members.map(item => item.userId || item.id) });
      return true;
    } catch (error) {
      if (familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return false;
      this.setData({ loadError: error.message || '成员加载失败' });
      wx.showToast({ title: error.message || '成员加载失败', icon: 'none' });
      return false;
    }
  },

  toggleDiner(event) {
    const id = event.currentTarget.dataset.id;
    const selected = new Set(this.data.selectedDinerIds);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    this.setData({ selectedDinerIds: Array.from(selected) }, () => this.loadRecommendations());
  },

  async loadRecommendations() {
    const requestId = ++recommendationRequestId;
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    const dinerIds = this.data.selectedDinerIds.slice();
    this.setData({ loading: true, loadError: '' });
    try {
      const result = await request({
        url: '/api/dish/recommend',
        method: 'POST',
        data: { dinerIds, page: 1, pageSize: 50 }
      });
      if (requestId !== recommendationRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;
      this.setData({ recommendations: result.list || [] });
    } catch (error) {
      if (requestId !== recommendationRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;
      this.setData({ loadError: error.message || '推荐加载失败' });
      wx.showToast({ title: error.message || '推荐加载失败', icon: 'none' });
    } finally {
      if (requestId === recommendationRequestId) this.setData({ loading: false });
    }
  },

  async retryRecommendations() {
    this.setData({ loadError: '' });
    if (!this.data.members.length && !await this.loadMembers()) return;
    await this.loadRecommendations();
  },

  onDishImageError(event) {
    const index = Number(event.currentTarget.dataset.index);
    const dishId = String(event.currentTarget.dataset.id || '');
    const current = this.data.recommendations[index];
    if (!Number.isInteger(index) || !current || !dishId || String(current.id) !== dishId) return;
    const recommendations = this.data.recommendations.map(item => {
      if (String(item.id) !== dishId) return item;
      const images = Array.isArray(item.images) ? item.images.slice() : [];
      images[0] = '/images/default-dish.png';
      return { ...item, images };
    });
    this.setData({ recommendations });
  },

  openDish(event) {
    wx.navigateTo({ url: `/pages/menu/detail/detail?id=${event.currentTarget.dataset.id}` });
  }
});
