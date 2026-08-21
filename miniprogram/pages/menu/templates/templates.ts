import { DishTemplate, DishType } from '../../../models/dish';
import { DishService } from '../../../services/dishService';

const TEMPLATE_PAGE_SIZE = 30;

interface TemplateCard extends DishTemplate {
  selected: boolean;
  ingredientSummary: string;
}

let templatesRequestId = 0;
let templateImportRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const normalizeTemplate = (template: DishTemplate): TemplateCard => {
  const ingredients = Array.isArray(template.ingredients) ? template.ingredients : [];
  const names = ingredients
    .map(item => String(item && item.name ? item.name : '').trim())
    .filter(Boolean)
    .slice(0, 4);
  const ingredientSummary = names.length > 0
    ? `${names.join('、')}${ingredients.length > names.length ? '等' : ''}`
    : '食材信息待补充';

  return {
    ...template,
    images: Array.isArray(template.images) ? template.images : [],
    ingredients,
    steps: Array.isArray(template.steps) ? template.steps : [],
    imported: !!template.imported,
    selected: false,
    ingredientSummary
  };
};

Page({
  data: {
    dishTypes: Object.values(DishType) as string[],
    selectedType: '',
    templates: [] as TemplateCard[],
    selectedIds: [] as string[],
    selectedCount: 0,
    allSelected: false,
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: '',
    importing: false,
    setupMode: false
  },

  onLoad(options?: Record<string, string | undefined>) {
    this.setData({ setupMode: options && options.setup === '1' });
    this.loadTemplates(true);
  },

  async loadTemplates(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;

    const requestId = ++templatesRequestId;
    const page = reset ? 1 : this.data.page;
    this.setData({
      ...(reset ? { loading: true, error: '', page: 1 } : { loadingMore: true }),
      ...(reset && this.data.templates.length === 0 ? { templates: [] } : {})
    });

    try {
      const result = await DishService.getDishTemplates(
        this.data.selectedType || undefined,
        page,
        TEMPLATE_PAGE_SIZE
      );
      if (requestId !== templatesRequestId) return;

      const incoming = Array.isArray(result && result.list)
        ? result.list.map(normalizeTemplate)
        : [];
      const previous = reset ? [] : (this.data.templates as TemplateCard[]);
      const existingIds = new Set(previous.map(item => String(item.id)));
      const merged = previous.concat(incoming.filter(item => !existingIds.has(String(item.id))));
      const total = Number(result && result.total) || merged.length;

      this.setTemplateSelection(merged, {
        page: page + 1,
        total,
        hasMore: merged.length < total,
        loading: false,
        loadingMore: false,
        refreshing: false,
        error: ''
      });
    } catch (error) {
      if (requestId !== templatesRequestId) return;
      this.setData({
        loading: false,
        loadingMore: false,
        refreshing: false,
        error: getErrorMessage(error, '模板加载失败，请稍后重试')
      });
    } finally {
      if (requestId === templatesRequestId && this.data.refreshing) {
        this.setData({ refreshing: false });
      }
    }
  },

  setTemplateSelection(
    templates: TemplateCard[],
    extra: Record<string, unknown> = {},
    selectedIdsOverride?: string[]
  ) {
    const selected = new Set<string>((selectedIdsOverride || this.data.selectedIds as string[]).map(String));
    templates.filter(item => item.imported).forEach(item => selected.delete(String(item.id)));
    const nextTemplates = templates.map(item => ({
      ...item,
      selected: !item.imported && selected.has(String(item.id))
    }));
    const selectable = nextTemplates.filter(item => !item.imported);
    const selectedIds = Array.from(selected);

    this.setData({
      templates: nextTemplates,
      selectedIds,
      selectedCount: selectedIds.length,
      allSelected: selectable.length > 0 && selectable.every(item => item.selected),
      ...extra
    });
  },

  selectType(event: WechatMiniprogram.TouchEvent) {
    const type = String(event.currentTarget.dataset.type || '');
    if (type === this.data.selectedType) return;
    templatesRequestId += 1;
    this.setData({
      selectedType: type,
      templates: [],
      selectedIds: this.data.selectedIds,
      selectedCount: this.data.selectedCount,
      allSelected: false,
      page: 1,
      total: 0,
      hasMore: false,
      loading: false,
      loadingMore: false,
      error: ''
    }, () => this.loadTemplates(true));
  },

  toggleTemplate(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id || this.data.importing) return;
    const template = (this.data.templates as TemplateCard[]).find(item => String(item.id) === id);
    if (!template || template.imported) return;

    const selected = new Set<string>(this.data.selectedIds as string[]);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.setTemplateSelection(this.data.templates as TemplateCard[], {}, Array.from(selected));
  },

  toggleSelectAll() {
    if (this.data.importing) return;
    const templates = this.data.templates as TemplateCard[];
    const selectable = templates.filter(item => !item.imported);
    if (!selectable.length) {
      wx.showToast({ title: '没有可导入的模板', icon: 'none' });
      return;
    }

    const selected = new Set<string>(this.data.selectedIds as string[]);
    if (this.data.allSelected) {
      selectable.forEach(item => selected.delete(String(item.id)));
    } else {
      selectable.forEach(item => selected.add(String(item.id)));
    }
    this.setTemplateSelection(templates, {}, Array.from(selected));
  },

  async importSelected() {
    if (this.data.importing) return;
    const templateIds = Array.from(new Set<string>((this.data.selectedIds as string[]).map(String)));
    if (!templateIds.length) {
      wx.showToast({ title: '请先选择菜谱', icon: 'none' });
      return;
    }

    const requestId = ++templateImportRequestId;
    this.setData({ importing: true });
    try {
      const result = await DishService.importDishTemplates(templateIds);
      if (requestId !== templateImportRequestId) return;
      const count = Number(result && result.count)
        || (Array.isArray(result && result.imported) ? result.imported.length : 0);
      wx.showToast({
        title: count > 0 ? `已加入 ${count} 道` : '菜谱已在菜单中',
        icon: 'success',
        duration: 1200
      });
      setTimeout(() => {
        if (requestId === templateImportRequestId) this.goBack();
      }, 650);
    } catch (error) {
      if (requestId !== templateImportRequestId) return;
      this.setData({ importing: false, error: getErrorMessage(error, '导入失败，请稍后重试') });
    }
  },

  retry() {
    this.loadTemplates(true);
  },

  onScrollToLower() {
    this.loadTemplates(false);
  },

  onPullDownRefresh() {
    if (this.data.loading || this.data.loadingMore) return;
    this.setData({ refreshing: true }, () => this.loadTemplates(true));
  },

  onTemplateImageError(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const templates = (this.data.templates as TemplateCard[]).map(item => (
      String(item.id) === id ? { ...item, images: ['/images/default-dish.jpg'] } : item
    ));
    this.setData({ templates });
  },

  goBack() {
    if (this.data.setupMode) {
      wx.switchTab({ url: '/pages/menu/menu' });
      return;
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/menu/menu' });
  },

  onUnload() {
    templatesRequestId += 1;
    templateImportRequestId += 1;
  }
});
