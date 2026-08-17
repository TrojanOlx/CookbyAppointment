import { AccountService } from '../../../services/accountService';

Page({
  data: {
    exporting: false,
    deleting: false,
    lastExportAt: ''
  },

  async exportData() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    try {
      const data = await AccountService.exportData();
      await new Promise<void>((resolve, reject) => {
        wx.setClipboardData({
          data: JSON.stringify(data, null, 2),
          success: () => resolve(),
          fail: reject
        });
      });
      this.setData({ lastExportAt: data.exportedAt || new Date().toISOString() });
      wx.showToast({ title: '数据已复制', icon: 'success' });
    } catch (error) {
      console.error('导出账号数据失败:', error);
      wx.showToast({ title: '导出失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  deleteAccount() {
    if (this.data.deleting) return;
    wx.showModal({
      title: '注销账号',
      content: '注销会退出所有家庭并清除个人资料和口味标签。家庭主需先转让或解散家庭。此操作不可撤销。',
      confirmText: '继续注销',
      confirmColor: '#c9493c',
      success: result => {
        if (!result.confirm) return;
        wx.showModal({
          title: '最后确认',
          content: '确定永久注销当前账号吗？',
          confirmText: '确认注销',
          confirmColor: '#c9493c',
          success: confirmation => {
            if (confirmation.confirm) void this.confirmDeleteAccount();
          }
        });
      }
    });
  },

  async confirmDeleteAccount() {
    this.setData({ deleting: true });
    try {
      await AccountService.deleteAccount();
      wx.clearStorageSync();
      wx.showToast({ title: '账号已注销', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), 600);
    } catch (error) {
      console.error('注销账号失败:', error);
    } finally {
      this.setData({ deleting: false });
    }
  }
});
