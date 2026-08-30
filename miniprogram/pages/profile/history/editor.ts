import { BASE_URL } from '../../../services/http';
import { DishService } from '../../../services/dishService';
import { HISTORY_MAX_NOTE_LENGTH, HISTORY_MAX_PHOTOS, HistoryService } from './historyService';
import {
  HistoryCreateInput,
  HistoryDishInput,
  HistoryScope,
  HistoryUpdateInput,
  MealRecord,
} from '../../../models/history';

const DEFAULT_IMAGE = '/images/default-dish.jpg';
const MEAL_TYPES = ['早餐', '午餐', '晚餐'];
let editorRequestId = 0;
let editorDishesRequestId = 0;
let editorContextToken = '';
let editorContextFamilyId = '';

type UploadSettlement<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

const settleUploads = <T>(promises: Array<Promise<T>>): Promise<UploadSettlement<T>[]> => {
  const promiseConstructor = Promise as unknown as {
    allSettled?: (values: Array<Promise<T>>) => Promise<UploadSettlement<T>[]>;
  };
  if (promiseConstructor.allSettled) return promiseConstructor.allSettled.call(Promise, promises);
  return Promise.all(promises.map(promise => promise.then(
    value => ({ status: 'fulfilled' as const, value }),
    reason => ({ status: 'rejected' as const, reason }),
  )));
};

interface DishOption {
  id: string;
  name: string;
  type?: string;
  image: string;
  selected: boolean;
}

interface EditorValueSnapshot {
  date: string;
  mealType: string;
  scope: HistoryScope;
  familyId: string;
  selectedDishIds: string[];
  customDishNames: string[];
  note: string;
  imageRefs: string[];
}

interface PartialHistorySaveError extends Error {
  code: 'HISTORY_PARTIAL_SAVE';
  completed: 'facts';
  cause?: unknown;
}

const activeFamilyId = (): string => {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') return String(value.id || value.familyId || value.family_id || '');
  return String(value || '');
};

const activeFamilyName = (): string => {
  const value = wx.getStorageSync('active_family');
  if (value && typeof value === 'object') return String(value.name || value.familyName || '当前家庭');
  return activeFamilyId() ? '当前家庭' : '尚未选择家庭';
};

const currentUserId = (): string => {
  const stored = wx.getStorageSync('userInfo');
  if (stored && typeof stored === 'object') {
    return String(stored.id || stored.userId || stored.openid || '');
  }
  return String(wx.getStorageSync('userId') || wx.getStorageSync('openid') || '');
};

const imageUrl = (value: unknown): string => {
  const source = String(value || '').trim();
  if (!source) return DEFAULT_IMAGE;
  if (/^(https?:|data:|wxfile:)/i.test(source)) return source;
  if (source.startsWith('/images/')) return source;
  if (source.startsWith('/')) return `${BASE_URL}${source}`;
  return `${BASE_URL}/${source}`;
};

const localDate = (): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const getErrorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) return String((error as { code?: unknown }).code || '');
  return '';
};

const parseNames = (value: string): string[] => Array.from(new Set(
  String(value || '')
    .split(/[,，、\n]/)
    .map(item => item.trim())
    .filter(Boolean)
)).slice(0, 30);

const normalizeStringList = (values: unknown[]): string[] => values
  .map(value => String(value || '').trim())
  .filter(Boolean);

const sameStringList = (left: string[], right: string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const isDefaultImage = (value: string): boolean => value === DEFAULT_IMAGE || value.endsWith(DEFAULT_IMAGE);

const createPartialHistorySaveError = (cause: unknown): PartialHistorySaveError => {
  const error = new Error('日期、餐次和菜品已保存，但感想/照片保存失败，请重试') as PartialHistorySaveError;
  error.code = 'HISTORY_PARTIAL_SAVE';
  error.completed = 'facts';
  error.cause = cause;
  return error;
};

Page({
  data: {
    recordId: '',
    editMode: false,
    date: localDate(),
    mealType: '晚餐',
    mealTypes: MEAL_TYPES,
    mealTypeIndex: 2,
    scope: 'personal' as HistoryScope,
    scopeTabs: [
      { value: 'personal', label: '只记在我的回忆' },
      { value: 'family', label: '加入当前家庭' },
    ],
    familyId: activeFamilyId(),
    familyName: activeFamilyName(),
    hasFamily: !!activeFamilyId(),
    dishOptions: [] as DishOption[],
    selectedDishIds: [] as string[],
    dishText: '',
    images: [] as string[],
    imageRefs: [] as string[],
    note: '',
    loading: false,
    loadingDishes: false,
    uploadingImages: false,
    saving: false,
    deleting: false,
    error: '',
    dishError: '',
    dishSelectionBlocked: false,
    canEdit: true,
    canDelete: false,
    frozen: false,
  },

  onLoad(options?: Record<string, string | undefined>) {
    const id = String(options && (options.id || options.recordId) || '');
    const familyId = activeFamilyId();
    (this as any)._editorValueSnapshot = null;
    const requestedScope = options && options.scope === 'family' && familyId ? 'family' : 'personal';
    editorContextToken = String(wx.getStorageSync('token') || '');
    editorContextFamilyId = familyId;
    this.setData({
      recordId: id,
      editMode: !!id,
      scope: requestedScope,
      familyId,
      familyName: activeFamilyName(),
      hasFamily: !!familyId,
      loading: !!id,
      canEdit: !id,
    });
    wx.setNavigationBarTitle({ title: id ? '编辑回忆' : '补记回忆' });
    if (id) this.loadRecord(id);
    else this.loadDishes();
  },

  onShow() {
    const token = String(wx.getStorageSync('token') || '');
    const familyId = activeFamilyId();
    if (token === editorContextToken && familyId === editorContextFamilyId) return;

    const familyChanged = familyId !== editorContextFamilyId;
    editorContextToken = token;
    editorContextFamilyId = familyId;
    editorRequestId += 1;
    editorDishesRequestId += 1;

    const recordId = String(this.data.recordId || '');
    const editingFamilyRecord = !!recordId && this.data.scope === 'family';
    const nextScope = !recordId && this.data.scope === 'family' && !familyId
      ? 'personal'
      : this.data.scope;
    this.setData({
      familyId: editingFamilyRecord ? this.data.familyId : familyId,
      familyName: editingFamilyRecord ? this.data.familyName : activeFamilyName(),
      hasFamily: !!familyId,
      scope: nextScope,
      dishOptions: [],
      selectedDishIds: recordId || !familyChanged ? this.data.selectedDishIds : [],
      loading: !!recordId,
      loadingDishes: false,
      dishError: '',
      dishSelectionBlocked: false,
      error: '',
    }, () => {
      if (recordId) this.loadRecord(recordId);
      else this.loadDishes();
    });
  },

  onUnload() {
    editorRequestId += 1;
    editorDishesRequestId += 1;
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ date: String(event.detail.value || localDate()) });
  },

  onMealTypeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    this.setData({ mealTypeIndex: index, mealType: MEAL_TYPES[index] || MEAL_TYPES[0] });
  },

  onScopeChange(event: WechatMiniprogram.TouchEvent) {
    const scope = String(event.currentTarget.dataset.scope || '') as HistoryScope;
    if (scope !== 'personal' && scope !== 'family') return;
    if (this.data.editMode) {
      wx.showToast({ title: '编辑时不能修改回忆范围', icon: 'none' });
      return;
    }
    if (scope === 'family' && !this.data.hasFamily) {
      wx.showToast({ title: '请先加入或创建家庭', icon: 'none' });
      return;
    }
    this.setData({ scope });
  },

  async loadRecord(id: string) {
    const requestId = ++editorRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const familyId = activeFamilyId();
    const isCurrentRequest = () => requestId === editorRequestId
      && id === this.data.recordId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === activeFamilyId();
    const restartForContextChange = () => {
      if (requestId !== editorRequestId) return;
      editorRequestId += 1;
      const nextFamilyId = activeFamilyId();
      editorContextToken = String(wx.getStorageSync('token') || '');
      editorContextFamilyId = nextFamilyId;
      const editingFamilyRecord = this.data.scope === 'family';
      this.setData({
        familyId: editingFamilyRecord ? this.data.familyId : nextFamilyId,
        familyName: editingFamilyRecord ? this.data.familyName : activeFamilyName(),
        hasFamily: !!nextFamilyId,
        dishOptions: [],
        loading: true,
        loadingDishes: false,
        dishError: '',
        dishSelectionBlocked: false,
      }, () => {
        if (this.data.recordId === id) this.loadRecord(id);
      });
    };
    try {
      const record = await HistoryService.getHistoryDetail(id);
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.applyRecord(record);
      this.setData({ loading: false, error: '' }, () => this.loadDishes());
    } catch (error) {
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.setData({ loading: false, error: getErrorMessage(error, '回忆加载失败，请返回重试') });
    }
  },

  applyRecord(record: MealRecord) {
    const raw = record as MealRecord & Record<string, unknown>;
    const recordDishes = Array.isArray(record.dishes) ? record.dishes : [];
    const selectedDishIds = recordDishes
      .map(item => String(item.dishId || item.originalDishId || ''))
      .filter(Boolean);
    const customNames = recordDishes
      .filter(item => !item.dishId && !item.originalDishId)
      .map(item => String(item.name || '').trim())
      .filter(Boolean);
    const ownParticipant = (Array.isArray(record.participants) ? record.participants : [])
      .find(item => item.userId === currentUserId());
    const ownContribution = ownParticipant && ownParticipant.contribution && typeof ownParticipant.contribution === 'object'
      ? ownParticipant.contribution
      : ownParticipant;
    const note = String(ownContribution?.note || ownContribution?.content || record.note || record.summary || '').trim();
    const recordImages = Array.isArray(record.images)
      ? record.images
      : (Array.isArray(record.photos)
        ? record.photos
        : (ownContribution && Array.isArray(ownContribution.images) ? ownContribution.images : []));
    const recordImageRefs = ownContribution && Array.isArray(ownContribution.imageRefs)
      ? ownContribution.imageRefs.map(String)
      : recordImages.map(String);
    const mealIndex = Math.max(0, MEAL_TYPES.indexOf(String(record.mealType || '')));
    const scope = record.scope === 'family' ? 'family' : 'personal';
    const effectiveSelectedDishIds = selectedDishIds;
    const dishNames = customNames;
    const frozen = record.frozen === true || Boolean(record.frozenAt || raw.frozen_at);
    const hasCanEdit = typeof record.canEdit === 'boolean';
    const hasCanDelete = typeof record.canDelete === 'boolean';
    this.setData({
      date: String(record.date || localDate()).slice(0, 10),
      mealType: String(record.mealType || MEAL_TYPES[mealIndex] || '晚餐'),
      mealTypeIndex: mealIndex,
      scope,
      selectedDishIds: effectiveSelectedDishIds,
      dishText: dishNames.join('、'),
      familyId: scope === 'family' ? String(record.familyId || raw.family_id || this.data.familyId || '') : this.data.familyId,
      familyName: String(record.familyName || raw.family_name || this.data.familyName || activeFamilyName()),
      images: recordImages.map(imageUrl),
      imageRefs: recordImageRefs,
      note,
      canEdit: hasCanEdit ? record.canEdit === true : (record.source === 'manual' && !frozen),
      canDelete: hasCanDelete ? record.canDelete === true : (record.source === 'manual' && !frozen),
      frozen,
    });
    this.updateDishSelection(effectiveSelectedDishIds);
    this.setEditorValueSnapshot({
      date: String(record.date || localDate()).slice(0, 10),
      mealType: String(record.mealType || MEAL_TYPES[mealIndex] || '晚餐'),
      scope,
      familyId: scope === 'family' ? String(record.familyId || raw.family_id || this.data.familyId || '') : '',
      selectedDishIds: effectiveSelectedDishIds,
      customDishNames: customNames,
      note,
      imageRefs: recordImageRefs,
    });
  },

  async loadDishes() {
    const familyId = activeFamilyId();
    const editingFamilyRecord = this.data.editMode && this.data.scope === 'family';
    const recordFamilyId = editingFamilyRecord ? String(this.data.familyId || '') : familyId;
    if (editingFamilyRecord && (!recordFamilyId || recordFamilyId !== familyId)) {
      editorDishesRequestId += 1;
      this.setData({
        dishOptions: [],
        loadingDishes: false,
        dishSelectionBlocked: true,
        dishError: recordFamilyId
          ? '请先切换到记录所属家庭，再选择菜单菜品'
          : '这段家庭回忆暂时无法读取菜单菜品',
      });
      return;
    }
    if (!familyId) {
      editorDishesRequestId += 1;
      this.setData({
        dishOptions: [],
        loadingDishes: false,
        dishSelectionBlocked: this.data.scope === 'family',
        dishError: this.data.scope === 'family' ? '请先选择一个家庭，再读取菜单菜品' : '',
      });
      return;
    }
    const requestId = ++editorDishesRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const isCurrentRequest = () => requestId === editorDishesRequestId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === activeFamilyId()
      && (!editingFamilyRecord || recordFamilyId === String(this.data.familyId || ''));
    const restartForContextChange = () => {
      if (requestId !== editorDishesRequestId) return;
      editorDishesRequestId += 1;
      const nextFamilyId = activeFamilyId();
      editorContextToken = String(wx.getStorageSync('token') || '');
      editorContextFamilyId = nextFamilyId;
      if (this.data.editMode && this.data.recordId) {
        this.setData({
          hasFamily: !!nextFamilyId,
          dishOptions: [],
          loading: true,
          loadingDishes: false,
          dishError: '',
          dishSelectionBlocked: false,
        }, () => this.loadRecord(String(this.data.recordId)));
        return;
      }
      const familyChanged = nextFamilyId !== familyId;
      this.setData({
        familyId: nextFamilyId,
        familyName: activeFamilyName(),
        hasFamily: !!nextFamilyId,
        dishOptions: [],
        selectedDishIds: familyChanged ? [] : this.data.selectedDishIds,
        loadingDishes: false,
        dishError: '',
        dishSelectionBlocked: false,
      }, () => this.loadDishes());
    };
    this.setData({ loadingDishes: true, dishError: '', dishSelectionBlocked: false });
    try {
      const result = await DishService.getDishList(1, 100);
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      const options: DishOption[] = (Array.isArray(result && result.list) ? result.list : []).map(item => ({
        id: String(item.id),
        name: String(item.name || '未命名菜品'),
        type: String(item.type || ''),
        image: imageUrl(Array.isArray(item.images) ? item.images[0] : ''),
        selected: (this.data.selectedDishIds as string[]).includes(String(item.id)),
      }));
      this.setData({ dishOptions: options, loadingDishes: false, dishSelectionBlocked: false });
    } catch (error) {
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.setData({ loadingDishes: false, dishError: getErrorMessage(error, '当前菜单暂时无法读取，可直接填写自定义菜名') });
    }
  },

  updateDishSelection(selectedDishIds: string[]) {
    const selected = new Set(selectedDishIds.map(String));
    const options = (this.data.dishOptions as DishOption[]).map(item => ({ ...item, selected: selected.has(String(item.id)) }));
    this.setData({ dishOptions: options, selectedDishIds: Array.from(selected) });
  },

  toggleDish(event: WechatMiniprogram.TouchEvent) {
    if (this.data.frozen || this.data.saving || (this.data.editMode && !this.data.canEdit)) return;
    if (this.data.dishSelectionBlocked) {
      wx.showToast({ title: '请先切换到这段回忆所属的家庭', icon: 'none' });
      return;
    }
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const selected = new Set<string>((this.data.selectedDishIds as string[]).map(String));
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.updateDishSelection(Array.from(selected));
  },

  onDishTextInput(event: WechatMiniprogram.Input) {
    this.setData({ dishText: String(event.detail.value || '').slice(0, 300) });
  },

  onNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ note: String(event.detail.value || '').slice(0, HISTORY_MAX_NOTE_LENGTH) });
  },

  async chooseImage() {
    if (this.data.uploadingImages || this.data.saving || this.data.frozen || (this.data.editMode && !this.data.canEdit)) return;
    const remaining = HISTORY_MAX_PHOTOS - (this.data.images as string[]).length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传${HISTORY_MAX_PHOTOS}张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: result => {
        const files = (result.tempFiles || []).slice(0, remaining);
        if (!files.length) return;
        this.setData({ uploadingImages: true });
        const recordId = String(this.data.recordId || '');
        const familyId = this.data.scope === 'family' ? String(this.data.familyId || '') : undefined;
        void settleUploads(files.map(file => HistoryService.uploadMemoryFile(file.tempFilePath, {
          recordId: recordId || undefined,
          familyId,
        })))
          .then(results => {
            const urls: string[] = [];
            const refs: string[] = [];
            let failedCount = 0;
            results.forEach(settled => {
              if (settled.status === 'rejected') {
                failedCount += 1;
                return;
              }
              const result = settled.value;
              const data = result && typeof result.data === 'object' ? result.data : undefined;
              const file = result && typeof result.file === 'object' ? result.file : undefined;
              const url = String(result.url || result.downloadUrl || data?.url || data?.downloadUrl || file?.url || file?.downloadUrl || result.filePath || data?.filePath || file?.filePath || '').trim();
              const ref = String(result.id || result.fileId || data?.id || data?.fileId || file?.id || file?.fileId || url).trim();
              if (url || ref) {
                urls.push(imageUrl(url || `/api/history/file/download?id=${encodeURIComponent(ref)}`));
                refs.push(ref || url);
              } else failedCount += 1;
            });
            if (urls.length) {
              this.setData({
                images: (this.data.images as string[]).concat(urls).slice(0, HISTORY_MAX_PHOTOS),
                imageRefs: (this.data.imageRefs as string[]).concat(refs).slice(0, HISTORY_MAX_PHOTOS),
              });
            }
            if (failedCount) wx.showToast({ title: `图片上传成功${urls.length}张，失败${failedCount}张`, icon: 'none' });
          })
          .catch(error => wx.showToast({ title: getErrorMessage(error, '图片上传失败'), icon: 'none' }))
          .finally(() => this.setData({ uploadingImages: false }));
      },
    });
  },

  removeImage(event: WechatMiniprogram.TouchEvent) {
    if (this.data.frozen || this.data.saving || (this.data.editMode && !this.data.canEdit)) return;
    const index = Number(event.currentTarget.dataset.index);
    const images = (this.data.images as string[]).slice();
    const refs = (this.data.imageRefs as string[]).slice();
    if (!Number.isInteger(index) || index < 0 || index >= images.length) return;
    images.splice(index, 1);
    refs.splice(index, 1);
    this.setData({ images, imageRefs: refs });
  },

  previewImage(event: WechatMiniprogram.TouchEvent) {
    const images = this.data.images as string[];
    const index = Number(event.currentTarget.dataset.index) || 0;
    if (images.length) wx.previewImage({ current: images[index] || images[0], urls: images });
  },

  async save() {
    if (this.data.saving || this.data.loading || this.data.uploadingImages || this.data.frozen) return;
    if (this.data.editMode && !this.data.canEdit) {
      wx.showToast({ title: '当前回忆不可编辑', icon: 'none' });
      return;
    }
    const selectedDishIds = (this.data.selectedDishIds as string[]).map(String).filter(Boolean);
    const customDishNames = parseNames(String(this.data.dishText || ''));
    if (!selectedDishIds.length && !customDishNames.length) {
      this.setData({ error: '请至少选择一道菜，或填写一个自定义菜名' });
      return;
    }
    if (!this.data.date) {
      this.setData({ error: '请选择用餐日期' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await this.submit(false, selectedDishIds, customDishNames);
      wx.showToast({ title: this.data.editMode ? '回忆已更新' : '回忆已补记', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack(), 650);
    } catch (error) {
      const message = error && typeof error === 'object' && 'code' in error
        && String((error as { code?: unknown }).code || '') === 'HISTORY_PARTIAL_SAVE'
        ? getErrorMessage(error, '部分保存成功，请重试')
        : getErrorMessage(error, '保存失败，请稍后重试');
      this.setData({ error: message });
    } finally {
      this.setData({ saving: false });
    }
  },

  async submit(confirmDuplicate: boolean, selectedDishIds: string[], customDishNames: string[]): Promise<void> {
    const selectedIds = Array.from(new Set(normalizeStringList(selectedDishIds)));
    const selectedIdSet = new Set(selectedIds);
    const selectedOptions = (this.data.dishOptions as DishOption[]).filter(item => selectedIdSet.has(String(item.id)));
    if (this.data.scope === 'personal' && selectedOptions.length !== selectedIdSet.size) {
      throw new Error('部分菜单菜品暂时无法读取，请重新选择或填写自定义菜名');
    }
    const personalDishSnapshots: HistoryDishInput[] = selectedOptions.map(item => {
      const image = String(item.image || '');
      return {
        name: item.name,
        type: item.type || '',
        ...(image && !isDefaultImage(image) ? { images: [image] } : {}),
      };
    });
    const customDishSnapshots: HistoryDishInput[] = customDishNames.map(name => ({ name }));
    const dishes: HistoryDishInput[] = this.data.scope === 'personal'
      ? personalDishSnapshots.concat(customDishSnapshots)
      : customDishSnapshots;
    const payload: HistoryCreateInput = {
      date: String(this.data.date),
      mealType: String(this.data.mealType),
      scope: this.data.scope as HistoryScope,
      familyId: this.data.scope === 'family' ? String(this.data.familyId || '') : undefined,
      dishIds: this.data.scope === 'family' ? selectedIds : [],
      dishNames: customDishNames,
      customDishNames,
      dishes,
      images: (this.data.imageRefs as string[]).slice(0, HISTORY_MAX_PHOTOS),
      imageRefs: (this.data.imageRefs as string[]).slice(0, HISTORY_MAX_PHOTOS),
      note: String(this.data.note || '').slice(0, HISTORY_MAX_NOTE_LENGTH),
      content: String(this.data.note || '').slice(0, HISTORY_MAX_NOTE_LENGTH),
      confirmDuplicate,
    };
    try {
      if (this.data.editMode) {
        const original = (this as any)._editorValueSnapshot as EditorValueSnapshot | null;
        const current: EditorValueSnapshot = {
          date: payload.date,
          mealType: payload.mealType,
          scope: payload.scope,
          familyId: payload.scope === 'family' ? String(this.data.familyId || '') : '',
          selectedDishIds: selectedIds,
          customDishNames: customDishNames.slice(),
          note: String(this.data.note || '').slice(0, HISTORY_MAX_NOTE_LENGTH),
          imageRefs: (this.data.imageRefs as string[]).slice(0, HISTORY_MAX_PHOTOS),
        };
        const factsChanged = !original
          || original.date !== current.date
          || original.mealType !== current.mealType
          || original.scope !== current.scope
          || original.familyId !== current.familyId
          || !sameStringList(original.selectedDishIds, current.selectedDishIds)
          || !sameStringList(original.customDishNames, current.customDishNames);
        const dishFieldsChanged = !original
          || !sameStringList(original.selectedDishIds, current.selectedDishIds)
          || !sameStringList(original.customDishNames, current.customDishNames);
        const contributionChanged = !original
          || original.note !== current.note
          || !sameStringList(original.imageRefs, current.imageRefs);

        if (factsChanged) {
          const updatePayload: HistoryUpdateInput = {
            id: String(this.data.recordId),
            date: payload.date,
            mealType: payload.mealType,
            scope: payload.scope,
            familyId: payload.familyId,
          };
          if (dishFieldsChanged) {
            updatePayload.dishIds = payload.dishIds;
            updatePayload.dishNames = payload.dishNames;
            updatePayload.customDishNames = payload.customDishNames;
            updatePayload.dishes = payload.dishes;
          }
          await HistoryService.updateHistory(updatePayload);
          this.mergeEditorValueSnapshot({
            date: current.date,
            mealType: current.mealType,
            scope: current.scope,
            familyId: current.familyId,
            selectedDishIds: current.selectedDishIds,
            customDishNames: current.customDishNames,
          });
        }
        if (contributionChanged) {
          try {
            await HistoryService.updateContribution({
              recordId: String(this.data.recordId),
              note: current.note,
              content: current.note,
              images: current.imageRefs,
              imageRefs: current.imageRefs,
            });
          } catch (error) {
            if (factsChanged) throw createPartialHistorySaveError(error);
            throw error;
          }
          this.mergeEditorValueSnapshot({ note: current.note, imageRefs: current.imageRefs });
        }
      } else {
        await HistoryService.createHistory(payload);
      }
    } catch (error) {
      if (!confirmDuplicate && getErrorCode(error) === 'HISTORY_DUPLICATE_CONFIRM_REQUIRED') {
        const confirmed = await this.confirmDuplicate();
        if (confirmed) return this.submit(true, selectedDishIds, customDishNames);
      }
      throw error;
    }
  },

  setEditorValueSnapshot(snapshot: EditorValueSnapshot) {
    (this as any)._editorValueSnapshot = {
      ...snapshot,
      selectedDishIds: snapshot.selectedDishIds.slice(),
      customDishNames: snapshot.customDishNames.slice(),
      imageRefs: snapshot.imageRefs.slice(),
    };
  },

  mergeEditorValueSnapshot(patch: Partial<EditorValueSnapshot>) {
    const current = (this as any)._editorValueSnapshot as EditorValueSnapshot | null;
    if (!current) return;
    this.setEditorValueSnapshot({
      ...current,
      ...patch,
      selectedDishIds: patch.selectedDishIds || current.selectedDishIds,
      customDishNames: patch.customDishNames || current.customDishNames,
      imageRefs: patch.imageRefs || current.imageRefs,
    });
  },

  confirmDuplicate(): Promise<boolean> {
    return new Promise(resolve => {
      wx.showModal({
        title: '可能是重复记录',
        content: '同一天、同一餐次和相同菜品已经有一条回忆，仍然要保存吗？',
        confirmText: '仍要保存',
        confirmColor: '#0f8f85',
        success: result => resolve(!!result.confirm),
        fail: () => resolve(false),
      });
    });
  },

  async deleteRecord() {
    if (!this.data.editMode || !this.data.canDelete || this.data.frozen || this.data.deleting || this.data.saving) return;
    const confirmed = await new Promise<boolean>(resolve => {
      wx.showModal({ title: '删除这段回忆', content: '删除后这条手动记录会从时间线移除，成就进度也会重新计算。', confirmText: '删除', confirmColor: '#c9493c', success: result => resolve(!!result.confirm), fail: () => resolve(false) });
    });
    if (!confirmed) return;
    this.setData({ deleting: true, error: '' });
    try {
      await HistoryService.deleteHistory(String(this.data.recordId));
      wx.showToast({ title: '回忆已删除', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack(), 650);
    } catch (error) {
      this.setData({ error: getErrorMessage(error, '删除失败，请稍后重试') });
    } finally {
      this.setData({ deleting: false });
    }
  },

  cancel() {
    if (this.data.saving || this.data.uploadingImages) return;
    wx.navigateBack();
  },

  onDishImageError(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const options = this.data.dishOptions as DishOption[];
    const index = options.findIndex(item => item.id === id);
    if (index >= 0 && options[index].image !== DEFAULT_IMAGE) this.setData({ [`dishOptions[${index}].image`]: DEFAULT_IMAGE });
  },
});
