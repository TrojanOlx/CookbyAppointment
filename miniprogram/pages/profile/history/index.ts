import { BASE_URL } from '../../../services/http';
import { HISTORY_PAGE_SIZE, HistoryService } from './historyService';
import {
  HistoryListFilters,
  HistoryScope,
  MealRecord,
} from '../../../models/history';

const { FamilyService } = require('../../../services/family');

interface HistoryTimelineItem extends MealRecord {
  displayDate: string;
  displayMonth: string;
  displayWeekday: string;
  displayDishes: string;
  displaySource: string;
  displaySummary: string;
  displayImage: string;
  displayFamily: string;
  displayParticipantCount: string;
  repeatIds: string[];
  unavailableNames: string[];
}

interface HistoryMonthGroup {
  month: string;
  items: HistoryTimelineItem[];
}

const DEFAULT_IMAGE = '/images/default-dish.jpg';
const SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'automatic', label: '预约完成' },
  { value: 'manual', label: '手动补记' },
  { value: 'legacy_backfill', label: '历史回填' },
];

let historyRequestId = 0;

const activeFamilyId = (): string => {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') {
    return String(value.id || value.familyId || value.family_id || '');
  }
  return String(value || '');
};

const activeFamilyName = (): string => {
  const family = wx.getStorageSync('active_family');
  if (family && typeof family === 'object') {
    return String(family.name || family.familyName || '当前家庭');
  }
  return activeFamilyId() ? '当前家庭' : '尚未选择家庭';
};

const normalizeFamilyId = (value: unknown): string => String(value || '').trim().replace(/^family:/, '');

const repeatFamilyIdFor = (record: MealRecord): string => {
  const raw = record as MealRecord & Record<string, unknown>;
  return normalizeFamilyId(record.repeatFamilyId || raw.repeat_family_id || record.familyId || raw.family_id);
};

const imageUrl = (value: unknown): string => {
  const source = String(value || '').trim();
  if (!source) return DEFAULT_IMAGE;
  if (/^(https?:|data:|wxfile:)/i.test(source)) return source;
  if (source.startsWith('/images/')) return source;
  if (source.startsWith('/')) return `${BASE_URL}${source}`;
  return `${BASE_URL}/${source}`;
};

const imageFromDish = (dish: Record<string, unknown> | undefined): string => {
  if (!dish) return DEFAULT_IMAGE;
  const images = Array.isArray(dish.images) ? dish.images : [];
  return imageUrl(dish.image || dish.imageUrl || images[0]);
};

const dateParts = (value: string): { date: string; month: string; weekday: string } => {
  const source = String(value || '').slice(0, 10);
  const match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return { date: source || '—', month: '未分类', weekday: '' };
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, monthNumber - 1, day);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return {
    date: `${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
    month: `${year}年${monthNumber}月`,
    weekday: weekdays[date.getDay()] || '',
  };
};

const sourceLabel = (source: string, fallback?: string): string => {
  const found = SOURCE_OPTIONS.find(item => item.value === source);
  return found ? found.label : String(fallback || source || '历史记录');
};

const normalizeRecord = (record: MealRecord): HistoryTimelineItem => {
  const item = record as MealRecord & Record<string, unknown>;
  const dateValue = String(record.date || item.mealDate || item.recordDate || '');
  const parts = dateParts(dateValue);
  const dishes = Array.isArray(record.dishes) ? record.dishes : [];
  const dishNames = dishes
    .map(dish => String(dish && dish.name || '').trim())
    .filter(Boolean);
  const images = Array.isArray(record.images)
    ? record.images
    : (Array.isArray(record.photos)
      ? record.photos
      : (Array.isArray(item.previewImages) ? item.previewImages as string[] : []));
  const firstDish = dishes[0] as Record<string, unknown> | undefined;
  const firstImage = images[0] || record.firstImage || record.imageUrl || imageFromDish(firstDish);
  const participants = Array.isArray(record.participants) ? record.participants : [];
  const repeatIds = Array.isArray(record.repeatDishIds)
    ? record.repeatDishIds.map(String).filter(Boolean)
    : dishes
      .filter(dish => dish && dish.available !== false && dish.repeatable !== false)
      .map(dish => String(dish.dishId || dish.originalDishId || ''))
      .filter(Boolean);
  const unavailableNames = Array.isArray(record.repeatUnavailableNames)
    ? record.repeatUnavailableNames.map(String).filter(Boolean)
    : dishes
      .filter(dish => dish && (dish.available === false || dish.repeatable === false))
      .map(dish => String(dish.name || '').trim())
      .filter(Boolean);
  const summary = String(record.summary || record.note || (participants[0] && (participants[0].note || participants[0].content)) || '').trim();
  const family = String(record.familyName || item.family_name || '').trim();
  return {
    ...record,
    displayDate: parts.date,
    displayMonth: parts.month,
    displayWeekday: parts.weekday,
    displayDishes: dishNames.length ? dishNames.join('、') : '未记录菜品',
    displaySource: sourceLabel(String(record.source || item.sourceType || ''), record.sourceLabel),
    displaySummary: summary || (record.source === 'automatic' ? '预约完成，留下这顿饭的时间' : '还没有写下感想'),
    displayImage: imageUrl(firstImage),
    displayFamily: family || (record.scope === 'personal' ? '个人回忆' : activeFamilyName()),
    displayParticipantCount: `${Math.max(Number(record.participantCount) || participants.length, 0)} 位参与者`,
    photoCount: Number(record.photoCount ?? item.memoryCount ?? 0) || 0,
    repeatIds,
    unavailableNames,
  };
};

const groupByMonth = (records: MealRecord[]): HistoryMonthGroup[] => {
  const groups: HistoryMonthGroup[] = [];
  const indexes = new Map<string, number>();
  records.map(normalizeRecord).forEach(item => {
    const existing = indexes.get(item.displayMonth);
    if (existing === undefined) {
      indexes.set(item.displayMonth, groups.length);
      groups.push({ month: item.displayMonth, items: [item] });
    } else {
      groups[existing].items.push(item);
    }
  });
  return groups;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const normalizeFilterFamilies = (filters?: HistoryListFilters): Array<{ id: string; name: string }> => {
  if (!filters || !Array.isArray(filters.families)) return [];
  return filters.families
    .map(item => ({ id: String(item.id || ''), name: String(item.name || '').trim() }))
    .filter(item => item.id && item.name);
};

Page({
  data: {
    scope: 'personal' as HistoryScope,
    scopeTabs: [
      { value: 'personal', label: '我的回忆' },
      { value: 'family', label: '当前家庭' },
    ],
    searchDraft: '',
    search: '',
    familyId: '',
    year: '',
    mealType: '',
    source: '',
    familyFilterIndex: 0,
    yearFilterIndex: 0,
    mealFilterIndex: 0,
    sourceFilterIndex: 0,
    familyFilterLabels: ['全部家庭'],
    familyFilterIds: [''],
    yearFilterLabels: ['全部年份'],
    yearFilterValues: [''],
    mealFilterLabels: ['全部餐次', '早餐', '午餐', '晚餐'],
    mealFilterValues: ['', '早餐', '午餐', '晚餐'],
    sourceFilterLabels: SOURCE_OPTIONS.map(item => item.label),
    sourceFilterValues: SOURCE_OPTIONS.map(item => item.value),
    groups: [] as HistoryMonthGroup[],
    total: 0,
    page: 1,
    pageSize: HISTORY_PAGE_SIZE,
    hasMore: false,
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: '',
    currentFamilyName: activeFamilyName(),
  },

  onLoad(options?: Record<string, string | undefined>) {
    const requestedScope = options && options.scope === 'family' ? 'family' : 'personal';
    const dishName = String(options && (options.dishName || options.normalizedName) || '').trim();
    const scopeId = String(options && options.scopeId || '').trim();
    const initialFamilyId = scopeId && scopeId !== 'personal' ? scopeId.replace(/^family:/, '') : '';
    this.setData({
      scope: requestedScope,
      searchDraft: dishName,
      search: dishName,
      familyId: initialFamilyId,
      currentFamilyName: activeFamilyName(),
    }, () => this.loadHistory(true));
  },

  onShow() {
    if ((this as any)._historyLoaded) {
      this.setData({ currentFamilyName: activeFamilyName() });
      this.loadHistory(true);
    }
  },

  onUnload() {
    historyRequestId += 1;
    const timer = (this as any)._historySearchTimer as ReturnType<typeof setTimeout> | undefined;
    if (timer) clearTimeout(timer);
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true }, () => this.loadHistory(true));
  },

  onScrollToLower() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadHistory(false);
    }
  },

  onScopeChange(event: WechatMiniprogram.TouchEvent) {
    const scope = String(event.currentTarget.dataset.scope || '') as HistoryScope;
    if (scope !== 'personal' && scope !== 'family') return;
    if (scope === this.data.scope) return;
    historyRequestId += 1;
    this.setData({
      scope,
      groups: [],
      page: 1,
      total: 0,
      hasMore: false,
      loading: false,
      loadingMore: false,
      error: '',
    }, () => this.loadHistory(true));
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    this.setData({ searchDraft: String(event.detail.value || '') });
  },

  onSearchConfirm() {
    this.applySearch();
  },

  applySearch() {
    const search = String(this.data.searchDraft || '').trim();
    if (search === this.data.search) return;
    historyRequestId += 1;
    this.setData({ search, groups: [], page: 1, total: 0, hasMore: false, error: '' }, () => this.loadHistory(true));
  },

  clearSearch() {
    if (!this.data.searchDraft && !this.data.search) return;
    historyRequestId += 1;
    this.setData({ searchDraft: '', search: '', groups: [], page: 1, total: 0, hasMore: false, error: '' }, () => this.loadHistory(true));
  },

  onFamilyFilterChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const ids = this.data.familyFilterIds as string[];
    this.applyFilter({
      familyFilterIndex: index,
      familyId: ids[index] || '',
    });
  },

  onYearFilterChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const values = this.data.yearFilterValues as string[];
    this.applyFilter({ yearFilterIndex: index, year: values[index] || '' });
  },

  onMealFilterChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const values = this.data.mealFilterValues as string[];
    this.applyFilter({ mealFilterIndex: index, mealType: values[index] || '' });
  },

  onSourceFilterChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const values = this.data.sourceFilterValues as string[];
    this.applyFilter({ sourceFilterIndex: index, source: values[index] || '' });
  },

  applyFilter(values: Record<string, unknown>) {
    historyRequestId += 1;
    this.setData({ ...values, groups: [], page: 1, total: 0, hasMore: false, error: '' }, () => this.loadHistory(true));
  },

  async loadHistory(reset: boolean) {
    if (!reset && (!this.data.hasMore || this.data.loading || this.data.loadingMore)) return;

    const requestId = ++historyRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const familyIdAtStart = activeFamilyId();
    const page = reset ? 1 : Number(this.data.page) || 1;
    const requestParams = {
      scope: this.data.scope,
      page,
      pageSize: HISTORY_PAGE_SIZE,
      search: this.data.search || undefined,
      familyId: this.data.familyId || undefined,
      year: this.data.year || undefined,
      mealType: this.data.mealType || undefined,
      source: this.data.source || undefined,
    };
    const isCurrentRequest = () => (
      requestId === historyRequestId
      && token === String(wx.getStorageSync('token') || '')
      && familyIdAtStart === activeFamilyId()
    );
    const restartForContextChange = () => {
      if (requestId !== historyRequestId) return;
      historyRequestId += 1;
      this.setData({ loading: false, loadingMore: false, refreshing: false }, () => this.loadHistory(true));
    };
    this.setData(reset
      ? { loading: true, loadingMore: false, error: '', page: 1 }
      : { loadingMore: true, error: '' });

    try {
      const result = await HistoryService.getHistoryList(requestParams);
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }

      const incoming = Array.isArray(result.list) ? result.list.map(normalizeRecord) : [];
      const existing = reset ? [] : (this.flattenGroups(this.data.groups as HistoryMonthGroup[]));
      const existingIds = new Set(existing.map(item => String(item.id)));
      const merged = existing.concat(incoming.filter(item => !existingIds.has(String(item.id))));
      const filters = result.filters;
      this.applyResponseFilters(filters);
      const total = Number(result.total) || merged.length;
      const hasMore = typeof result.hasMore === 'boolean'
        ? result.hasMore
        : merged.length < total;
      this.setData({
        groups: groupByMonth(merged),
        total,
        page: page + 1,
        hasMore,
        loading: false,
        loadingMore: false,
        refreshing: false,
        error: '',
      });
      (this as any)._historyLoaded = true;
    } catch (error) {
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.setData({
        loading: false,
        loadingMore: false,
        refreshing: false,
        error: getErrorMessage(error, '餐桌回忆暂时无法加载'),
      });
    } finally {
      if (requestId === historyRequestId) wx.stopPullDownRefresh();
    }
  },

  flattenGroups(groups: HistoryMonthGroup[]): HistoryTimelineItem[] {
    return groups.reduce<HistoryTimelineItem[]>((result, group) => result.concat(group.items || []), []);
  },

  applyResponseFilters(filters?: HistoryListFilters) {
    const families = normalizeFilterFamilies(filters);
    const updates: Record<string, unknown> = {};
    if (filters && Array.isArray(filters.families)) {
      const labels = ['全部家庭'].concat(families.map(item => item.name));
      const ids = [''].concat(families.map(item => item.id));
      const currentId = String(this.data.familyId || '');
      const index = Math.max(0, ids.indexOf(currentId));
      updates.familyFilterLabels = labels;
      updates.familyFilterIds = ids;
      updates.familyFilterIndex = index;
      if (index === 0 && currentId) updates.familyId = '';
    }
    if (filters && Array.isArray(filters.years)) {
      const years = filters.years.map(String).filter(Boolean);
      const values = [''].concat(years);
      const labels = ['全部年份'].concat(years.map(year => `${year}年`));
      const currentYear = String(this.data.year || '');
      const index = Math.max(0, values.indexOf(currentYear));
      updates.yearFilterLabels = labels;
      updates.yearFilterValues = values;
      updates.yearFilterIndex = index;
      if (index === 0 && currentYear) updates.year = '';
    }
    if (filters && Array.isArray(filters.mealTypes)) {
      const meals = filters.mealTypes.map(String).filter(Boolean);
      const values = [''].concat(meals);
      const labels = ['全部餐次'].concat(meals);
      const currentMeal = String(this.data.mealType || '');
      const index = Math.max(0, values.indexOf(currentMeal));
      updates.mealFilterLabels = labels;
      updates.mealFilterValues = values;
      updates.mealFilterIndex = index;
      if (index === 0 && currentMeal) updates.mealType = '';
    }
    if (filters && Array.isArray(filters.sources)) {
      const sources = filters.sources
        .map(item => typeof item === 'string' ? item : item && item.value)
        .map(String)
        .filter(value => SOURCE_OPTIONS.some(option => option.value === value));
      const values = [''].concat(Array.from(new Set(sources)));
      const labels = values.map(value => sourceLabel(value));
      const currentSource = String(this.data.source || '');
      const index = Math.max(0, values.indexOf(currentSource));
      updates.sourceFilterValues = values;
      updates.sourceFilterLabels = labels;
      updates.sourceFilterIndex = index;
      if (index === 0 && currentSource) updates.source = '';
    }
    if (Object.keys(updates).length) this.setData(updates);
  },

  retry() {
    this.loadHistory(true);
  },

  createMemory() {
    wx.navigateTo({ url: '/pages/profile/history/editor' });
  },

  openRecord(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/profile/history/detail?id=${encodeURIComponent(id)}` });
  },

  async repeatRecord(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const record = this.flattenGroups(this.data.groups as HistoryMonthGroup[]).find(item => String(item.id) === id);
    if (!record) return;
    const repeatIds = record.repeatIds || [];
    if (!repeatIds.length) {
      wx.showModal({ title: '暂时无法再来一次', content: record.unavailableNames.length ? `“${record.unavailableNames.join('、')}”已不在当前家庭菜单中。` : '原菜品已删除或当前没有权限访问，无法自动预填。', showCancel: false });
      return;
    }
    const targetFamilyId = repeatFamilyIdFor(record);
    if (!targetFamilyId) {
      wx.showModal({ title: '暂时无法再来一次', content: '原记录所属家庭已不可用，无法自动预填。', showCancel: false });
      return;
    }
    const currentFamilyId = normalizeFamilyId(FamilyService.getActiveFamilyId() || activeFamilyId());
    const shouldSwitchFamily = Boolean(targetFamilyId && targetFamilyId !== currentFamilyId);
    if (shouldSwitchFamily) {
      try {
        const families = await FamilyService.list();
        const originalFamily = Array.isArray(families)
          && families.find(item => normalizeFamilyId(item && (item.id || item.familyId)) === targetFamilyId);
        if (!originalFamily) {
          wx.showModal({ title: '暂时无法再来一次', content: '原家庭已不存在或你已无权访问，无法自动预填。', showCancel: false });
          return;
        }
      } catch (error) {
        wx.showModal({ title: '暂时无法再来一次', content: '原家庭暂时无法访问，请稍后重试。', showCancel: false });
        return;
      }
    }
    const modalLines: string[] = [];
    if (shouldSwitchFamily) {
      const familyName = String(record.familyName || '原家庭').trim();
      modalLines.push(`这段回忆来自“${familyName}”，继续后会切换到该家庭。`);
    }
    if (record.unavailableNames.length) {
      modalLines.push(`将只带入仍在原家庭菜单中的 ${repeatIds.length} 道菜；${record.unavailableNames.join('、')}不会被创建。`);
    }
    if (modalLines.length) {
      const result = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => {
        wx.showModal({
          title: shouldSwitchFamily ? '切换家庭再来一次' : '部分菜品不可用',
          content: modalLines.join('\n\n'),
          confirmText: shouldSwitchFamily ? '切换并继续' : '继续',
          success: resolve,
          fail: () => resolve({ confirm: false, cancel: true, content: '', errMsg: '' }),
        });
      });
      if (!result.confirm) return;
    }

    if (shouldSwitchFamily) {
      // Do not overwrite a family selection made while the modal was open.
      const latestFamilyId = normalizeFamilyId(FamilyService.getActiveFamilyId() || activeFamilyId());
      if (latestFamilyId !== currentFamilyId) {
        wx.showToast({ title: '家庭已切换，请重新操作', icon: 'none' });
        return;
      }
      const selectedFamilyId = normalizeFamilyId(FamilyService.setActiveFamilyId(targetFamilyId));
      if (selectedFamilyId !== targetFamilyId) {
        wx.showToast({ title: '原家庭暂时无法切换', icon: 'none' });
        return;
      }
    }

    const query = `prefillDishIds=${encodeURIComponent(repeatIds.join(','))}&mealType=${encodeURIComponent(String(record.mealType || ''))}`;
    wx.navigateTo({ url: `/pages/appointment/booking/booking?${query}` });
  },

  onImageError(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const groups = this.data.groups as HistoryMonthGroup[];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const itemIndex = groups[groupIndex].items.findIndex(item => String(item.id) === id);
      if (itemIndex >= 0 && groups[groupIndex].items[itemIndex].displayImage !== DEFAULT_IMAGE) {
        this.setData({ [`groups[${groupIndex}].items[${itemIndex}].displayImage`]: DEFAULT_IMAGE });
        return;
      }
    }
  },
});
