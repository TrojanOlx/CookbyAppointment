import {
  PlatformCatalogService,
  PlatformRecipeTemplate,
  PlatformTemplateIngredient
} from '../services/platformCatalogService';

const TEMPLATE_PAGE_SIZE = 20;
let templateRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const types = ['炒菜', '青菜', '炖汤', '红烧', '蒸菜'];

Page({
  data: {
    statusOptions: [
      { value: '', label: '全部状态' },
      { value: 'active', label: '已上架' },
      { value: 'archived', label: '未上架' }
    ],
    typeOptions: [''].concat(types),
    status: '',
    type: '',
    templates: [] as PlatformRecipeTemplate[],
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: ''
  },

  onShow() {
    void this.loadTemplates(true);
  },

  onUnload() {
    templateRequestId += 1;
  },

  async loadTemplates(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = ++templateRequestId;
    const page = reset ? 1 : this.data.page;
    this.setData({
      ...(reset ? { loading: true, error: '', page: 1 } : { loadingMore: true }),
      ...(reset && !this.data.templates.length ? { templates: [] } : {})
    });
    try {
      const result = await PlatformCatalogService.listTemplates({
        status: this.data.status || undefined,
        type: this.data.type || undefined,
        page,
        pageSize: TEMPLATE_PAGE_SIZE
      });
      if (requestId !== templateRequestId) return;
      const previous = reset ? [] : (this.data.templates as PlatformRecipeTemplate[]);
      const seen = new Set(previous.map(item => String(item.id)));
      const merged = previous.concat(result.list.filter(item => !seen.has(String(item.id))));
      this.setData({
        templates: merged,
        total: result.total,
        page: page + 1,
        hasMore: merged.length < result.total,
        loading: false,
        loadingMore: false,
        refreshing: false,
        error: ''
      });
    } catch (error) {
      if (requestId !== templateRequestId) return;
      this.setData({ loading: false, loadingMore: false, refreshing: false, error: getErrorMessage(error, '模板加载失败，请稍后重试') });
    }
  },

  refresh() {
    this.setData({ refreshing: true });
    void this.loadTemplates(true);
  },

  retry() {
    void this.loadTemplates(true);
  },

  loadMore() {
    void this.loadTemplates(false);
  },

  selectStatus(event: any) {
    const status = String(event.currentTarget.dataset.value || '');
    if (status === this.data.status) return;
    templateRequestId += 1;
    this.setData({ status, templates: [], page: 1, total: 0, hasMore: false, loading: false, loadingMore: false }, () => {
      void this.loadTemplates(true);
    });
  },

  selectType(event: any) {
    const type = String(event.currentTarget.dataset.value || '');
    if (type === this.data.type) return;
    templateRequestId += 1;
    this.setData({ type, templates: [], page: 1, total: 0, hasMore: false, loading: false, loadingMore: false }, () => {
      void this.loadTemplates(true);
    });
  },

  ingredientSummary(ingredients: PlatformTemplateIngredient[]): string {
    const names = (Array.isArray(ingredients) ? ingredients : [])
      .map(item => String(item.name || item.canonicalName || '').trim())
      .filter(Boolean)
      .slice(0, 4);
    return names.length ? `${names.join('、')}${ingredients.length > names.length ? '等' : ''}` : '食材信息待补充';
  },

  getStatusText(status: string): string {
    if (status === 'active') return '已上架';
    if (status === 'draft') return '草稿';
    return '未上架';
  },

  onTemplateImageError(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const fallbackIndex = Number(event.currentTarget.dataset.index);
    const templates = this.data.templates as PlatformRecipeTemplate[];
    const index = id
      ? templates.findIndex(item => String(item.id) === id)
      : fallbackIndex;
    if (index < 0 || index >= templates.length) return;
    if (templates[index].images && templates[index].images[0] === '/images/default-dish.jpg') return;
    this.setData({ [`templates[${index}].images`]: ['/images/default-dish.jpg'] });
  },

  createTemplate() {
    wx.navigateTo({ url: '/pages/platform-admin/template-edit/template-edit' });
  },

  editTemplate(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    if (id) wx.navigateTo({ url: `/pages/platform-admin/template-edit/template-edit?id=${encodeURIComponent(id)}` });
  },

  goIngredients() {
    wx.navigateTo({ url: '/pages/platform-admin/ingredients/ingredients' });
  },

  changeStatus(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const action = String(event.currentTarget.dataset.status || '');
    const item = (this.data.templates as PlatformRecipeTemplate[]).find(template => String(template.id) === id);
    if (!id || !item || (action !== 'publish' && action !== 'archive')) return;
    const title = action === 'publish' ? '确认上架模板？' : '确认下架模板？';
    const content = action === 'publish' ? '上架后家庭管理员可以复制这份菜谱。' : '下架后不会影响已经复制到家庭的菜谱。';
    wx.showModal({
      title,
      content,
      confirmText: action === 'publish' ? '上架' : '下架',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          if (action === 'publish') await PlatformCatalogService.publishTemplate(id, item.updatedAt);
          else await PlatformCatalogService.archiveTemplate(id, item.updatedAt);
          wx.showToast({ title: action === 'publish' ? '已上架' : '已下架', icon: 'success' });
          void this.loadTemplates(true);
        } catch (error) {
          wx.showToast({ title: getErrorMessage(error, '操作失败，请重试'), icon: 'none' });
        }
      }
    });
  }
});
