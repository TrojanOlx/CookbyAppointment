import { PlatformAdminService, PlatformOverview } from '../../../services/platformAdminService';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

Page({
  data: {
    loading: false,
    isPlatformAdmin: false,
    overview: {
      totalUsers: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      totalFamilies: 0,
      activeFamilies: 0,
      totalRecipeTemplates: 0,
      publishedRecipeTemplates: 0,
      totalIngredients: 0
    } as PlatformOverview,
    error: ''
  },

  onLoad() {
    void this.loadDashboard();
  },

  onPullDownRefresh() {
    void this.loadDashboard(true);
  },

  async loadDashboard(refreshing = false) {
    if (!refreshing && this.data.loading && this.data.error === '') return;
    this.setData({ loading: true, error: '' });
    try {
      const status = await PlatformAdminService.getStatus();
      if (!status.isPlatformAdmin) {
        this.setData({ isPlatformAdmin: false, loading: false });
        return;
      }
      const overview = await PlatformAdminService.getOverview();
      this.setData({ isPlatformAdmin: true, overview, loading: false });
    } catch (error) {
      this.setData({ loading: false, error: getErrorMessage(error, '平台数据暂时无法加载') });
    } finally {
      if (refreshing) wx.stopPullDownRefresh();
    }
  },

  retry() {
    void this.loadDashboard(true);
  },

  openUsers() {
    wx.navigateTo({ url: '/pages/platform-admin/users/users' });
  },

  openFamilies() {
    wx.navigateTo({ url: '/pages/platform-admin/families/families' });
  },

  openAudit() {
    wx.navigateTo({ url: '/pages/platform-admin/audit/audit' });
  },

  openTemplates() {
    wx.navigateTo({ url: '/pages/platform-admin/templates/templates' });
  },

  openIngredients() {
    wx.navigateTo({ url: '/pages/platform-admin/ingredients/ingredients' });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
