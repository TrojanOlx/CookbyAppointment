import { AccountService } from '../../../services/accountService';
import { ImageCacheService } from '../../../utils/imageCache';
import { getAuthSessionGeneration, invalidateAuthSession } from '../../../utils/auth';

let accountExportRequestId = 0;
let accountDeleteRequestId = 0;
let accountPageGeneration = 0;

Page({
  data: {
    exporting: false,
    deleting: false,
    deleteConfirming: false,
    lastExportAt: ''
  },

  async exportData() {
    if (this.data.exporting) return;
    const requestId = ++accountExportRequestId;
    const pageGeneration = accountPageGeneration;
    const token = String(wx.getStorageSync('token') || '');
    const isCurrentRequest = () => (
      requestId === accountExportRequestId
      && pageGeneration === accountPageGeneration
      && token === String(wx.getStorageSync('token') || '')
    );
    this.setData({ exporting: true });
    try {
      const data = await AccountService.exportData();
      if (!isCurrentRequest()) return;
      await new Promise<void>((resolve, reject) => {
        wx.setClipboardData({
          data: JSON.stringify(data, null, 2),
          success: () => resolve(),
          fail: reject
        });
      });
      if (!isCurrentRequest()) return;
      this.setData({ lastExportAt: data.exportedAt || new Date().toISOString() });
      wx.showToast({ title: '数据已复制', icon: 'success' });
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('导出账号数据失败:', error);
      wx.showToast({ title: '导出失败，请稍后重试', icon: 'none' });
    } finally {
      if (requestId === accountExportRequestId) this.setData({ exporting: false });
    }
  },

  deleteAccount() {
    if (this.data.deleting || this.data.deleteConfirming) return;
    const pageGeneration = accountPageGeneration;
    const confirmationToken = String(wx.getStorageSync('token') || '');
    (this as any)._deleteConfirmationToken = confirmationToken;
    this.setData({ deleteConfirming: true });
    wx.showModal({
      title: '注销账号',
      content: '注销会退出所有家庭并清除个人资料和口味标签。家庭主需先转让或解散家庭。此操作不可撤销。',
      confirmText: '继续注销',
      confirmColor: '#c9493c',
      success: result => {
        if (pageGeneration !== accountPageGeneration) return;
        if (!result.confirm) {
          this.setData({ deleteConfirming: false });
          return;
        }
        wx.showModal({
          title: '最后确认',
          content: '确定永久注销当前账号吗？',
          confirmText: '确认注销',
          confirmColor: '#c9493c',
          success: confirmation => {
            if (pageGeneration !== accountPageGeneration) return;
            if (confirmation.confirm && (this as any)._deleteConfirmationToken === String(wx.getStorageSync('token') || '')) {
              void this.confirmDeleteAccount();
            } else {
              this.setData({ deleteConfirming: false });
            }
          },
          fail: () => {
            if (pageGeneration !== accountPageGeneration) return;
            this.setData({ deleteConfirming: false });
          }
        });
      },
      fail: () => {
        if (pageGeneration !== accountPageGeneration) return;
        this.setData({ deleteConfirming: false });
      }
    });
  },

  async confirmDeleteAccount() {
    if (this.data.deleting) return;
    const requestId = ++accountDeleteRequestId;
    const pageGeneration = accountPageGeneration;
    const token = String(wx.getStorageSync('token') || '');
    const isCurrentRequest = () => (
      requestId === accountDeleteRequestId
      && pageGeneration === accountPageGeneration
      && token === String(wx.getStorageSync('token') || '')
    );
    let navigationPending = false;
    this.setData({ deleting: true });
    try {
      await AccountService.deleteAccount();
      if (!isCurrentRequest()) return;
      const postDeleteAuthGeneration = invalidateAuthSession();
      const clearImageCache = ImageCacheService.clear();
      wx.clearStorageSync();
      await clearImageCache;
      const isCurrentDeletedSession = () => (
        requestId === accountDeleteRequestId
        && pageGeneration === accountPageGeneration
        && postDeleteAuthGeneration === getAuthSessionGeneration()
        && !wx.getStorageSync('token')
      );
      if (!isCurrentDeletedSession()) return;
      wx.showToast({ title: '账号已注销', icon: 'success' });
      navigationPending = true;
      setTimeout(() => {
        if (!isCurrentDeletedSession()) return;
        wx.switchTab({
          url: '/pages/profile/profile',
          complete: () => this.setData({ deleting: false, deleteConfirming: false })
        });
      }, 600);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('注销账号失败:', error);
    } finally {
      if (requestId === accountDeleteRequestId && !navigationPending) {
        this.setData({ deleting: false, deleteConfirming: false });
      }
    }
  },

  onUnload() {
    accountPageGeneration += 1;
    accountExportRequestId += 1;
    accountDeleteRequestId += 1;
  }
});
