import {
  PlatformCatalogService,
  PlatformRecipeTemplate,
  PlatformTemplateIngredient,
  TemplateWritePayload
} from '../../../services/platformCatalogService';

const typeOptions = ['炒菜', '青菜', '炖汤', '红烧', '蒸菜'];
const spicyOptions = ['不辣', '微辣', '中辣', '特辣'];
let editorRequestId = 0;
let ingredientLocalId = 0;

const emptyIngredient = (): PlatformTemplateIngredient => ({
  localKey: `new-${Date.now()}-${++ingredientLocalId}`,
  name: '',
  amount: '',
  unit: ''
});

const assetIdFromUrl = (value: string): string => {
  try {
    const url = new URL(value, 'https://platform-assets.local');
    const match = url.pathname.match(/^\/api\/platform\/template-assets\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
};

const deleteAssets = async (assetIds: string[]): Promise<void> => {
  const uniqueIds = Array.from(new Set(assetIds.filter(Boolean)));
  await Promise.all(uniqueIds.map(async id => {
    try {
      await PlatformCatalogService.deleteTemplateAsset(id);
    } catch (error) {
      console.warn('清理模板图片失败:', id, error);
    }
  }));
};

const blankTemplate = (): PlatformRecipeTemplate => ({
  id: '',
  name: '',
  type: typeOptions[0],
  spicy: spicyOptions[0],
  images: [],
  ingredients: [emptyIngredient()],
  steps: [''],
  notice: '',
  remark: '',
  reference: '',
  status: 'archived'
});

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
    isEdit: false,
    template: blankTemplate(),
    typeOptions,
    spicyOptions,
    typeIndex: 0,
    spicyIndex: 0,
    loading: false,
    saving: false,
    uploadingImage: false,
    dirty: false,
    loadError: '',
    uploadedAssetIds: [] as string[],
    pendingDeleteAssetIds: [] as string[]
  },

  onLoad(options?: Record<string, string | undefined>) {
    (this as any)._editorUnloaded = false;
    const id = options && options.id ? String(options.id) : '';
    if (!id) return;
    this.setData({ isEdit: true, loading: true });
    const requestId = ++editorRequestId;
    PlatformCatalogService.getTemplate(id).then(template => {
      if (requestId !== editorRequestId) return;
      const normalized = {
        ...blankTemplate(),
        ...template,
        ingredients: template.ingredients.length
          ? template.ingredients.map(item => ({ ...item, localKey: item.id || `loaded-${++ingredientLocalId}` }))
          : [emptyIngredient()],
        steps: template.steps.length ? template.steps : ['']
      };
      this.setData({
        template: normalized,
        typeIndex: Math.max(0, typeOptions.indexOf(normalized.type)),
        spicyIndex: Math.max(0, spicyOptions.indexOf(normalized.spicy)),
        loading: false,
        loadError: ''
      });
    }).catch(error => {
      if (requestId !== editorRequestId) return;
      this.setData({ loading: false, loadError: getErrorMessage(error, '模板加载失败，请稍后重试') });
    });
  },

  onUnload() {
    (this as any)._editorUnloaded = true;
    editorRequestId += 1;
    if (this.data.saving) return;
    const uploadedAssetIds = (this.data.uploadedAssetIds as string[]).slice();
    if (uploadedAssetIds.length) {
      this.setData({ uploadedAssetIds: [] });
      void deleteAssets(uploadedAssetIds);
    }
  },

  retryLoad() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const id = page && page.options ? String(page.options.id || '') : '';
    if (!id) return;
    this.setData({ loading: true, loadError: '' });
    const requestId = ++editorRequestId;
    PlatformCatalogService.getTemplate(id).then(template => {
      if (requestId !== editorRequestId) return;
      const normalized = {
        ...blankTemplate(),
        ...template,
        ingredients: template.ingredients.length
          ? template.ingredients.map(item => ({ ...item, localKey: item.id || `loaded-${++ingredientLocalId}` }))
          : [emptyIngredient()],
        steps: template.steps.length ? template.steps : ['']
      };
      this.setData({ template: normalized, typeIndex: Math.max(0, typeOptions.indexOf(normalized.type)), spicyIndex: Math.max(0, spicyOptions.indexOf(normalized.spicy)), loading: false, loadError: '' });
    }).catch(error => {
      if (requestId === editorRequestId) this.setData({ loading: false, loadError: getErrorMessage(error, '模板加载失败，请稍后重试') });
    });
  },

  markDirty() {
    if (!this.data.dirty) this.setData({ dirty: true });
  },

  nameInput(event: any) { this.setData({ 'template.name': String(event.detail.value || ''), dirty: true }); },
  noticeInput(event: any) { this.setData({ 'template.notice': String(event.detail.value || ''), dirty: true }); },
  referenceInput(event: any) { this.setData({ 'template.reference': String(event.detail.value || ''), dirty: true }); },

  typeChange(event: any) {
    const index = Number(event.detail.value) || 0;
    this.setData({ typeIndex: index, 'template.type': typeOptions[index] || typeOptions[0], dirty: true });
  },

  spicyChange(event: any) {
    const index = Number(event.detail.value) || 0;
    this.setData({ spicyIndex: index, 'template.spicy': spicyOptions[index] || spicyOptions[0], dirty: true });
  },

  chooseImage() {
    if (this.data.uploadingImage) return;
    const remaining = 6 - this.data.template.images.length;
    wx.chooseImage({
      count: Math.max(1, Math.min(6, remaining)),
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        this.setData({ uploadingImage: true });
        try {
          const uploaded: string[] = [];
          for (const path of result.tempFilePaths) {
            const asset = await PlatformCatalogService.uploadTemplateAsset(path, this.data.template.id || undefined);
            if (asset.url) {
              uploaded.push(asset.url);
              if (asset.id) {
                this.setData({
                  uploadedAssetIds: Array.from(new Set((this.data.uploadedAssetIds as string[]).concat(asset.id)))
                });
              }
            }
          }
          if (!uploaded.length) throw new Error('图片上传失败');
          const images = (this.data.template.images as string[]).concat(uploaded).slice(0, 6);
          this.setData({ 'template.images': images, dirty: true });
          wx.showToast({ title: `已添加 ${uploaded.length} 张`, icon: 'success', duration: 1200 });
        } catch (error) {
          wx.showToast({ title: getErrorMessage(error, '图片上传失败'), icon: 'none' });
        } finally {
          this.setData({ uploadingImage: false });
        }
      }
    });
  },

  deleteImage(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const images = (this.data.template.images as string[]).slice();
    if (index < 0 || index >= images.length) return;
    const removed = images.splice(index, 1)[0];
    const assetId = assetIdFromUrl(removed);
    const uploadedAssetIds = (this.data.uploadedAssetIds as string[]).slice();
    const wasUploadedNow = assetId ? uploadedAssetIds.includes(assetId) : false;
    const nextUploadedAssetIds = wasUploadedNow
      ? uploadedAssetIds.filter(id => id !== assetId)
      : uploadedAssetIds;
    const pendingDeleteAssetIds = assetId && this.data.isEdit && !wasUploadedNow
      ? Array.from(new Set((this.data.pendingDeleteAssetIds as string[]).concat(assetId)))
      : this.data.pendingDeleteAssetIds;
    this.setData({
      'template.images': images,
      uploadedAssetIds: nextUploadedAssetIds,
      pendingDeleteAssetIds,
      dirty: true
    });
    if (assetId && wasUploadedNow) void deleteAssets([assetId]);
  },

  addIngredient() {
    const ingredients = (this.data.template.ingredients as PlatformTemplateIngredient[]).slice();
    ingredients.push(emptyIngredient());
    this.setData({ 'template.ingredients': ingredients, dirty: true });
  },

  deleteIngredient(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const ingredients = (this.data.template.ingredients as PlatformTemplateIngredient[]).slice();
    if (ingredients.length <= 1) {
      wx.showToast({ title: '至少保留一项食材', icon: 'none' });
      return;
    }
    ingredients.splice(index, 1);
    this.setData({ 'template.ingredients': ingredients, dirty: true });
  },

  ingredientNameInput(event: any) { this.setData({ [`template.ingredients[${event.currentTarget.dataset.index}].name`]: String(event.detail.value || ''), dirty: true }); },
  ingredientAmountInput(event: any) { this.setData({ [`template.ingredients[${event.currentTarget.dataset.index}].amount`]: String(event.detail.value || ''), dirty: true }); },
  ingredientUnitInput(event: any) { this.setData({ [`template.ingredients[${event.currentTarget.dataset.index}].unit`]: String(event.detail.value || ''), dirty: true }); },

  addStep() {
    const steps = (this.data.template.steps as string[]).slice();
    steps.push('');
    this.setData({ 'template.steps': steps, dirty: true });
  },

  deleteStep(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const steps = (this.data.template.steps as string[]).slice();
    if (steps.length <= 1) {
      wx.showToast({ title: '至少保留一步', icon: 'none' });
      return;
    }
    steps.splice(index, 1);
    this.setData({ 'template.steps': steps, dirty: true });
  },

  stepInput(event: any) { this.setData({ [`template.steps[${event.currentTarget.dataset.index}]`]: String(event.detail.value || ''), dirty: true }); },

  async saveTemplate() {
    if (this.data.saving || this.data.uploadingImage) return;
    const template = this.data.template as PlatformRecipeTemplate;
    const name = String(template.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写菜品名称', icon: 'none' });
      return;
    }
    const ingredients = template.ingredients
      .map(item => {
        const amount = String(item.amount || '').trim();
        const unit = String(item.unit || '').trim();
        return {
          ...item,
          name: String(item.name || '').trim(),
          amount: amount && unit && !amount.includes(unit) ? `${amount}${unit}` : amount,
          unit
        };
      })
      .filter(item => item.name);
    const steps = template.steps.map(step => String(step || '').trim()).filter(Boolean);
    if (!ingredients.length) {
      wx.showToast({ title: '请至少填写一项食材', icon: 'none' });
      return;
    }
    if (!steps.length) {
      wx.showToast({ title: '请至少填写一步制作步骤', icon: 'none' });
      return;
    }
    const payload: TemplateWritePayload = {
      name,
      type: template.type || typeOptions[0],
      spicy: template.spicy || spicyOptions[0],
      images: template.images.slice(),
      ingredients,
      steps,
      notice: String(template.notice || '').trim(),
      remark: String(template.remark || '').trim(),
      reference: String(template.reference || '').trim(),
      status: template.status || 'archived',
      ...(template.id && template.updatedAt !== undefined ? { expectedUpdatedAt: template.updatedAt } : {})
    };
    const uploadedAssetIdsAtSave = (this.data.uploadedAssetIds as string[]).slice();
    this.setData({ saving: true });
    try {
      if (template.id) await PlatformCatalogService.updateTemplate(template.id, payload);
      else await PlatformCatalogService.createTemplate(payload);
      const pendingDeleteAssetIds = (this.data.pendingDeleteAssetIds as string[]).slice();
      if (!(this as any)._editorUnloaded) {
        this.setData({
          saving: false,
          dirty: false,
          uploadedAssetIds: [],
          pendingDeleteAssetIds: []
        });
      }
      await deleteAssets(pendingDeleteAssetIds);
      if ((this as any)._editorUnloaded) return;
      wx.showToast({ title: '模板已保存', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 650);
    } catch (error) {
      if ((this as any)._editorUnloaded) {
        await deleteAssets(uploadedAssetIdsAtSave);
        return;
      }
      this.setData({ saving: false });
      wx.showToast({ title: getErrorMessage(error, '保存失败，请重试'), icon: 'none' });
    }
  },

  closeEditor() {
    if (this.data.saving) {
      wx.showToast({ title: '正在保存，请稍候', icon: 'none' });
      return;
    }
    if (!this.data.dirty) {
      const uploadedAssetIds = (this.data.uploadedAssetIds as string[]).slice();
      this.setData({ uploadedAssetIds: [] });
      void deleteAssets(uploadedAssetIds).then(() => wx.navigateBack({ delta: 1 }));
      return;
    }
    wx.showModal({
      title: '放弃未保存内容？',
      content: '离开后本次修改不会保留。',
      confirmText: '放弃',
      cancelText: '继续编辑',
      success: result => {
        if (!result.confirm) return;
        const uploadedAssetIds = (this.data.uploadedAssetIds as string[]).slice();
        this.setData({ uploadedAssetIds: [] });
        void deleteAssets(uploadedAssetIds).then(() => wx.navigateBack({ delta: 1 }));
      }
    });
  }
});
