import {
  IngredientWritePayload,
  PlatformCatalogService,
  PlatformIngredient
} from '../../../services/platformCatalogService';

const PAGE_SIZE = 30;
let catalogRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

interface IngredientForm {
  canonicalName: string;
  category: string;
  defaultUnit: string;
  aliasesText: string;
}

interface IngredientRow extends PlatformIngredient {
  aliasText: string;
}

const emptyForm = (): IngredientForm => ({ canonicalName: '', category: '', defaultUnit: '', aliasesText: '' });

const splitAliases = (text: string): string[] => Array.from(new Set(String(text || '').split(/[,，、\n]/).map(value => value.trim()).filter(Boolean)));

Page({
  data: {
    ingredients: [] as IngredientRow[],
    categoryOptions: [''],
    category: '',
    keyword: '',
    page: 1,
    total: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: '',
    editorVisible: false,
    editingId: '',
    editingUpdatedAt: undefined as number | string | undefined,
    form: emptyForm(),
    saving: false
  },

  onLoad() { this.loadIngredients(true); },

  onUnload() { catalogRequestId += 1; },

  async loadIngredients(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = ++catalogRequestId;
    const page = reset ? 1 : this.data.page;
    this.setData({ ...(reset ? { loading: true, error: '', page: 1 } : { loadingMore: true }), ...(reset && !this.data.ingredients.length ? { ingredients: [] } : {}) });
    try {
      const result = await PlatformCatalogService.listIngredients({ keyword: this.data.keyword.trim() || undefined, category: this.data.category || undefined, page, pageSize: PAGE_SIZE });
      if (requestId !== catalogRequestId) return;
      const previous = reset ? [] : (this.data.ingredients as IngredientRow[]);
      const seen = new Set(previous.map(item => String(item.id)));
      const incoming: IngredientRow[] = result.list
        .filter(item => !seen.has(String(item.id)))
        .map(item => ({ ...item, aliasText: item.aliases.join('、') }));
      const merged = previous.concat(incoming);
      const allCategories = Array.from(new Set(merged.map(item => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
      this.setData({ ingredients: merged, total: result.total, page: page + 1, hasMore: merged.length < result.total, categoryOptions: [''].concat(allCategories), loading: false, loadingMore: false, refreshing: false, error: '' });
    } catch (error) {
      if (requestId !== catalogRequestId) return;
      this.setData({ loading: false, loadingMore: false, refreshing: false, error: getErrorMessage(error, '食材目录加载失败，请稍后重试') });
    }
  },

  refresh() { this.setData({ refreshing: true }); void this.loadIngredients(true); },
  retry() { void this.loadIngredients(true); },
  loadMore() { void this.loadIngredients(false); },

  keywordInput(event: any) { this.setData({ keyword: String(event.detail.value || '') }); },
  submitSearch() { catalogRequestId += 1; void this.loadIngredients(true); },
  clearSearch() { this.setData({ keyword: '' }, () => { catalogRequestId += 1; void this.loadIngredients(true); }); },

  selectCategory(event: any) {
    const category = String(event.currentTarget.dataset.value || '');
    if (category === this.data.category) return;
    catalogRequestId += 1;
    this.setData({ category, ingredients: [], page: 1, total: 0, hasMore: false }, () => { void this.loadIngredients(true); });
  },

  openCreate() { this.setData({ editorVisible: true, editingId: '', editingUpdatedAt: undefined, form: emptyForm() }); },

  openEdit(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = (this.data.ingredients as IngredientRow[]).find(value => String(value.id) === id);
    if (!item) return;
    this.setData({ editorVisible: true, editingId: id, editingUpdatedAt: item.updatedAt, form: { canonicalName: item.canonicalName, category: item.category, defaultUnit: item.defaultUnit, aliasesText: item.aliases.join('、') } });
  },

  closeEditor() { if (!this.data.saving) this.setData({ editorVisible: false }); },
  stopPropagation() {},
  canonicalNameInput(event: any) { this.setData({ 'form.canonicalName': String(event.detail.value || '') }); },
  categoryInput(event: any) { this.setData({ 'form.category': String(event.detail.value || '') }); },
  defaultUnitInput(event: any) { this.setData({ 'form.defaultUnit': String(event.detail.value || '') }); },
  aliasesInput(event: any) { this.setData({ 'form.aliasesText': String(event.detail.value || '') }); },

  async saveIngredient() {
    if (this.data.saving) return;
    const form = this.data.form as IngredientForm;
    const canonicalName = form.canonicalName.trim();
    if (!canonicalName) { wx.showToast({ title: '请填写标准名称', icon: 'none' }); return; }
    const payload: IngredientWritePayload = {
      canonicalName,
      category: form.category.trim(),
      defaultUnit: form.defaultUnit.trim(),
      aliases: splitAliases(form.aliasesText).filter(alias => alias !== canonicalName),
      ...(this.data.editingId && this.data.editingUpdatedAt !== undefined ? { expectedUpdatedAt: this.data.editingUpdatedAt } : {})
    };
    this.setData({ saving: true });
    try {
      if (this.data.editingId) await PlatformCatalogService.updateIngredient(this.data.editingId, payload);
      else await PlatformCatalogService.createIngredient(payload);
      this.setData({ saving: false, editorVisible: false });
      wx.showToast({ title: '食材已保存', icon: 'success', duration: 1200 });
      void this.loadIngredients(true);
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: getErrorMessage(error, '保存失败，请重试'), icon: 'none' });
    }
  },

  goBack() { wx.navigateBack({ delta: 1 }); }
});
