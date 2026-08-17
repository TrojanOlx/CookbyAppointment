const { FamilyService } = require('../../../services/family');

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
    this.setData({ saving: true });
    try {
      const family = await FamilyService.create(name, this.data.timezone);
      if (!family || !family.id) throw new Error('创建结果缺少家庭 ID');
      FamilyService.setActiveFamilyId(family.id);
      wx.showToast({ title: '家庭已创建', icon: 'success', duration: 1200 });
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) wx.navigateBack();
        else wx.redirectTo({ url: '/pages/family/index/index' });
      }, 500);
    } catch (error) {
      console.error('创建家庭失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '创建失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
