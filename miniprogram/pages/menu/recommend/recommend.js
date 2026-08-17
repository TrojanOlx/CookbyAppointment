const { request } = require('../../../services/http');
const { FamilyService } = require('../../../services/family');

Page({
  data: {
    loading: false,
    members: [],
    selectedDinerIds: [],
    recommendations: []
  },

  async onLoad() {
    if (!FamilyService.getActiveFamilyId()) {
      wx.showModal({
        title: '请选择家庭',
        content: '冰箱推荐只使用当前家庭的菜谱和库存。',
        showCancel: false,
        success: () => wx.navigateTo({ url: '/pages/family/index/index' })
      });
      return;
    }
    await this.loadMembers();
    await this.loadRecommendations();
  },

  async loadMembers() {
    try {
      const members = await FamilyService.members();
      this.setData({ members, selectedDinerIds: members.map(item => item.userId || item.id) });
    } catch (error) {
      wx.showToast({ title: error.message || '成员加载失败', icon: 'none' });
    }
  },

  toggleDiner(event) {
    const id = event.currentTarget.dataset.id;
    const selected = new Set(this.data.selectedDinerIds);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    this.setData({ selectedDinerIds: Array.from(selected) }, () => this.loadRecommendations());
  },

  async loadRecommendations() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const result = await request({
        url: '/api/dish/recommend',
        method: 'POST',
        data: { dinerIds: this.data.selectedDinerIds, page: 1, pageSize: 50 }
      });
      this.setData({ recommendations: result.list || [] });
    } catch (error) {
      wx.showToast({ title: error.message || '推荐加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openDish(event) {
    wx.navigateTo({ url: `/pages/menu/detail/detail?id=${event.currentTarget.dataset.id}` });
  }
});
