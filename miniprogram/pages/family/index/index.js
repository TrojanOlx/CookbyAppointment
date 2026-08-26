const { FamilyService } = require('../../../services/family');
const { createAppShareContent } = require('../../../utils/share');

let familyListRequestId = 0;

Page({
  data: {
    families: [],
    activeFamilyId: '',
    loading: false,
    loadError: '',
    hasToken: false,
    refreshing: false
  },

  onLoad() {
    this.setData({ hasToken: !!wx.getStorageSync('token') });
  },

  onShow() {
    const hasToken = !!wx.getStorageSync('token');
    this.setData({ hasToken });
    if (hasToken) this.loadFamilies();
    else {
      familyListRequestId += 1;
      this._familyListToken = '';
      this.setData({ families: [], activeFamilyId: '', loading: false, loadError: '', refreshing: false });
    }
  },

  async loadFamilies() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ families: [], activeFamilyId: '', loading: false, refreshing: false });
      return;
    }
    if (this.data.loading && this._familyListToken === token) return;
    this._familyListToken = token;
    const requestId = ++familyListRequestId;
    this.setData({ loading: true, loadError: '' });
    try {
      const families = await FamilyService.list();
      if (requestId !== familyListRequestId || wx.getStorageSync('token') !== token) return;
      let activeFamilyId = FamilyService.getActiveFamilyId();
      const activeExists = families.some(item => item.id === activeFamilyId);
      if (!activeExists) activeFamilyId = families.length ? families[0].id : '';
      if (activeFamilyId) FamilyService.setActiveFamilyId(activeFamilyId);
      else FamilyService.clearActiveFamilyId();
      this.setData({ families, activeFamilyId });
    } catch (error) {
      if (requestId !== familyListRequestId || wx.getStorageSync('token') !== token) return;
      console.error('获取家庭列表失败:', error);
      this.setData({ loadError: error && error.message ? error.message : '家庭列表暂时无法加载，请重试' });
      wx.showToast({ title: error && error.message ? error.message : '家庭列表加载失败', icon: 'none' });
    } finally {
      if (requestId === familyListRequestId) {
        this.setData({ loading: false, refreshing: false });
        if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      }
    }
  },

  onPullDownRefresh() {
    if (!this.data.hasToken) {
      wx.stopPullDownRefresh();
      return;
    }
    if (this.data.loading) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ refreshing: true });
    this.loadFamilies();
  },

  selectFamily(event) {
    const familyId = event.currentTarget.dataset.id;
    if (!familyId || familyId === this.data.activeFamilyId) return;
    FamilyService.setActiveFamilyId(familyId);
    this.setData({ activeFamilyId: familyId });
    wx.showToast({ title: '已切换家庭', icon: 'success', duration: 1200 });
  },

  openMembers(event) {
    const familyId = event.currentTarget.dataset.id;
    if (familyId) FamilyService.setActiveFamilyId(familyId);
    wx.navigateTo({ url: '/pages/family/members/members' });
  },

  openCreate() {
    wx.navigateTo({ url: '/pages/family/create/create' });
  },

  openJoin() {
    wx.navigateTo({ url: '/pages/family/join/join' });
  },

  openInvite() {
    wx.navigateTo({ url: '/pages/family/invite/invite' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  onShareAppMessage() {
    return createAppShareContent();
  }
});
