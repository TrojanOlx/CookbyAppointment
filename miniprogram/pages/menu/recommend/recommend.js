const { getCached } = require('../../../services/http');
const { FamilyService } = require('../../../services/family');
const { ImageCacheService } = require('../../../utils/imageCache');

let recommendationRequestId = 0;

Page({
  data: {
    familyId: '',
    loading: false,
    loadError: '',
    members: [],
    selectedDinerIds: [],
    recommendations: [],
    recommendationQueued: false,
    currentPage: 1,
    total: 0,
    hasMore: true,
    loadingMore: false
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
    this.setData({ familyId, members: [], selectedDinerIds: [], recommendations: [], loadError: '', loading: false, recommendationQueued: false, currentPage: 1, total: 0, hasMore: true, loadingMore: false });
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

  async loadRecommendations(reset = true) {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    if (!familyId || familyId !== this.data.familyId) return;
    if (this.data.loading || this.data.loadingMore) {
      if (reset) this.setData({ recommendationQueued: true });
      return;
    }
    if (!reset && !this.data.hasMore) return;
    const requestId = ++recommendationRequestId;
    const dinerIds = this.data.selectedDinerIds.slice();
    const page = reset ? 1 : this.data.currentPage;
    this.setData(reset ? { loading: true, loadError: '' } : { loadingMore: true });
    try {
      const result = await getCached('/api/dish/recommend', {
        dinerIds: dinerIds.join(','), page, pageSize: 20
      }, {
        resource: 'dish',
        ttlMs: 60 * 1000
      });
      if (requestId !== recommendationRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;
      const sourceList = result.list || [];
      const list = await ImageCacheService.withCachedImages(
        sourceList,
        item => item.images && item.images.length ? item.images[0] : undefined,
        'cachedImage',
        {
          getIdentity: () => ({ familyId }),
          onResolved: updates => {
            if (requestId !== recommendationRequestId) return;
            wx.nextTick(() => {
              if (requestId !== recommendationRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '')) return;
              updates.forEach(update => {
                const source = sourceList[update.index];
                if (!source) return;
                const index = this.data.recommendations.findIndex(item => String(item.id) === String(source.id));
                if (index >= 0) this.setData({ [`recommendations[${index}].${update.field}`]: update.value });
              });
            });
          }
        }
      );
      const total = Number(result.total || 0);
      const recommendations = reset ? list : this.data.recommendations.concat(list);
      this.setData({
        recommendations,
        total,
        currentPage: page + 1,
        hasMore: typeof result.hasMore === 'boolean' ? result.hasMore : recommendations.length < total
      });
    } catch (error) {
      if (requestId !== recommendationRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;
      this.setData({ loadError: error.message || '推荐加载失败' });
      wx.showToast({ title: error.message || '推荐加载失败', icon: 'none' });
    } finally {
      if (requestId === recommendationRequestId) {
        const queued = this.data.recommendationQueued;
        this.setData({ loading: false, loadingMore: false, recommendationQueued: false }, () => {
          if (queued
            && familyId === String(FamilyService.getActiveFamilyId() || '')
            && familyId === this.data.familyId) {
            this.loadRecommendations();
          }
        });
      }
    }
  },

  onScrollToLower() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadRecommendations(false);
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
      return { ...item, cachedImage: '/images/default-dish.jpg' };
    });
    this.setData({ recommendations });
  },

  onMemberImageError(event) {
    const memberId = String(event.currentTarget.dataset.id || '');
    const fallbackIndex = Number(event.currentTarget.dataset.index);
    const index = memberId
      ? this.data.members.findIndex(item => String(item.userId || item.id || '') === memberId)
      : fallbackIndex;
    if (index < 0 || index >= this.data.members.length) return;
    if (!this.data.members[index].avatarUrl) return;
    this.setData({ [`members[${index}].avatarUrl`]: '' });
  },

  openDish(event) {
    wx.navigateTo({ url: `/pages/menu/detail/detail?id=${event.currentTarget.dataset.id}` });
  }
});
