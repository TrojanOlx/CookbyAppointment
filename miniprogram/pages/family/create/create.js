const { FamilyService } = require('../../../services/family');

let createFamilyRequestId = 0;

Page({
  data: {
    name: '',
    timezone: 'Asia/Shanghai',
    saving: false
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value || '' });
  },

  onNameConfirm() {
    this.createFamily();
  },

  onTimezoneChange(event) {
    this.setData({ timezone: event.detail.value || 'Asia/Shanghai' });
  },

  async createFamily() {
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请先填写家庭名称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    const requestId = ++createFamilyRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const isCurrentRequest = () => (
      requestId === createFamilyRequestId
      && token === String(wx.getStorageSync('token') || '')
    );
    let navigationPending = false;
    this.setData({ saving: true });
    try {
      const family = await FamilyService.create(name, this.data.timezone);
      if (!isCurrentRequest()) return;
      if (!family || !family.id) throw new Error('创建结果缺少家庭 ID');
      FamilyService.setActiveFamilyId(family.id);
      wx.showToast({ title: '家庭已创建', icon: 'success', duration: 1200 });
      navigationPending = true;
      setTimeout(() => {
        if (requestId !== createFamilyRequestId || token !== String(wx.getStorageSync('token') || '')) {
          if (requestId === createFamilyRequestId) this.setData({ saving: false });
          return;
        }
        wx.redirectTo({ url: '/pages/menu/templates/templates?setup=1' });
        this.setData({ saving: false });
      }, 500);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('创建家庭失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '创建失败，请稍后重试', icon: 'none' });
    } finally {
      if (requestId === createFamilyRequestId && !navigationPending) {
        this.setData({ saving: false });
      }
    }
  },

  onUnload() {
    createFamilyRequestId += 1;
  },

  goBack() {
    wx.navigateBack();
  }
});
