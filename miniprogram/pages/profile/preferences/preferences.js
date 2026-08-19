const { PreferencesService } = require('../../../services/preferences');
const preferenceModel = require('../../../models/preferences');

let preferencesRequestId = 0;
let preferencesEditRevision = 0;
let preferencesInputRevision = 0;

const currentSessionScope = () => {
  const family = wx.getStorageSync('active_family_id');
  const familyId = family && typeof family === 'object'
    ? family.id || family.familyId || family.family_id || ''
    : family;
  return `${String(wx.getStorageSync('token') || '')}:${String(familyId || '')}`;
};

const CATEGORY_CONFIG = Object.freeze([
  {
    key: 'allergies',
    title: '过敏食材',
    eyebrow: '需要特别留意',
    hint: '用于备菜提醒，不会阻止预约。',
    placeholder: '添加过敏食材',
    tone: 'coral'
  },
  {
    key: 'dislikes',
    title: '不吃的食材',
    eyebrow: '餐桌避雷',
    hint: '帮助家人记住你的口味选择。',
    placeholder: '添加不吃的食材',
    tone: 'orange'
  },
  {
    key: 'likes',
    title: '喜欢的食材',
    eyebrow: '可以多安排',
    hint: '让菜单更贴近你的偏好。',
    placeholder: '添加喜欢的食材',
    tone: 'teal'
  }
]);

const unique = (values) => {
  const seen = Object.create(null);
  return (values || []).filter((value) => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
};

const createCategoryState = (preferences) => CATEGORY_CONFIG.map((config) => {
  const selected = unique(preferences[config.key]);
  const presets = preferenceModel.PRESET_TAGS[config.key] || [];
  const tags = unique(presets.concat(selected)).map((label) => ({
    label,
    selected: selected.indexOf(label) >= 0,
    custom: presets.indexOf(label) < 0
  }));

  return {
    ...config,
    tags,
    customInput: ''
  };
});

const spicyLabel = (value) => {
  const item = preferenceModel.SPICY_LEVELS.find((level) => level.value === value);
  return item ? item.label : '未设置';
};

Page({
  data: {
    categories: createCategoryState(preferenceModel.createDefaultPreferences()),
    spicyLevels: preferenceModel.SPICY_LEVELS.filter((level) => level.value),
    spicyLevel: '',
    spicyLabel: '未设置',
    loading: false,
    refreshing: false,
    saving: false,
    dirty: false,
    hasLoaded: false,
    loadError: ''
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '口味偏好' });
    this.loadPreferences();
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadPreferences(true);
  },

  async loadPreferences(fromRefresh) {
    if (this.data.loading && !fromRefresh) return;
    const requestId = ++preferencesRequestId;
    const editRevision = preferencesEditRevision;
    const inputRevision = preferencesInputRevision;
    const wasDirty = this.data.dirty;
    const wasLoaded = this.data.hasLoaded;
    const sessionScope = currentSessionScope();
    const isCurrentRequest = () => requestId === preferencesRequestId
      && sessionScope === currentSessionScope();
    this.setData({ loading: true, loadError: '' });

    try {
      const preferences = await PreferencesService.getPreferences();
      if (!isCurrentRequest()
        || editRevision !== preferencesEditRevision
        || inputRevision !== preferencesInputRevision
        || wasDirty) return;
      this.applyPreferences(preferences);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.warn('加载口味偏好失败:', error);
      this.setData({ hasLoaded: wasLoaded, loadError: '口味偏好暂时无法加载，请重试后再编辑。' });
      wx.showToast({ title: '偏好暂时无法加载', icon: 'none' });
    } finally {
      if (isCurrentRequest()) {
        this.setData({ loading: false, refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  applyPreferences(value) {
    const preferences = preferenceModel.normalizePreferences(value);
    this.setData({
      categories: createCategoryState(preferences),
      spicyLevel: preferences.spicyLevel,
      spicyLabel: spicyLabel(preferences.spicyLevel),
      dirty: false,
      hasLoaded: true,
      loadError: ''
    });
  },

  retryLoad() {
    this.loadPreferences();
  },

  toggleTag(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    const tagIndex = Number(event.currentTarget.dataset.tagIndex);
    const category = this.data.categories[categoryIndex];
    const tag = category && category.tags[tagIndex];
    if (!tag) return;
    preferencesEditRevision += 1;
    preferencesInputRevision += 1;

    this.setData({
      [`categories[${categoryIndex}].tags[${tagIndex}].selected`]: !tag.selected,
      dirty: true
    });
  },

  onCustomInput(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    preferencesInputRevision += 1;
    this.setData({
      [`categories[${categoryIndex}].customInput`]: event.detail.value || ''
    });
  },

  addCustomTag(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    const category = this.data.categories[categoryIndex];
    const label = String((category && category.customInput) || '').trim();
    if (!category || !label) return;
    preferencesEditRevision += 1;
    preferencesInputRevision += 1;

    const duplicateIndex = category.tags.findIndex((tag) => tag.label === label);
    if (duplicateIndex >= 0) {
      this.setData({
        [`categories[${categoryIndex}].tags[${duplicateIndex}].selected`]: true,
        [`categories[${categoryIndex}].customInput`]: '',
        dirty: true
      });
      return;
    }

    this.setData({
      [`categories[${categoryIndex}].tags`]: category.tags.concat({
        label,
        selected: true,
        custom: true
      }),
      [`categories[${categoryIndex}].customInput`]: '',
      dirty: true
    });
  },

  selectSpicy(event) {
    const spicyLevel = event.currentTarget.dataset.value || '';
    preferencesEditRevision += 1;
    preferencesInputRevision += 1;
    this.setData({
      spicyLevel,
      spicyLabel: spicyLabel(spicyLevel),
      dirty: true
    });
  },

  collectPreferences() {
    const preferences = preferenceModel.createDefaultPreferences();
    this.data.categories.forEach((category) => {
      preferences[category.key] = category.tags
        .filter((tag) => tag.selected)
        .map((tag) => tag.label);
    });
    preferences.spicyLevel = this.data.spicyLevel || '';
    return preferenceModel.serializePreferences(preferences);
  },

  async savePreferences() {
    if (this.data.saving) return;
    if (!this.data.hasLoaded) {
      wx.showToast({ title: '请先重新加载偏好', icon: 'none' });
      return;
    }
    this.setData({ saving: true });

    const payload = this.collectPreferences();
    const editRevision = preferencesEditRevision;
    const inputRevision = preferencesInputRevision;
    const sessionScope = currentSessionScope();
    try {
      const response = await PreferencesService.updatePreferences(payload);
      if (sessionScope !== currentSessionScope()) return;
      if (editRevision !== preferencesEditRevision) return;
      if (inputRevision !== preferencesInputRevision) {
        // 保存期间继续输入的自定义标签只是草稿，不能被服务端响应清空。
        this.setData({ dirty: false });
      } else if (preferenceModel.hasPreferencePayload(response)) {
        this.applyPreferences(response);
      } else {
        this.setData({ dirty: false });
      }
      wx.showToast({ title: '偏好已保存', icon: 'success' });
    } catch (error) {
      if (sessionScope !== currentSessionScope()) return;
      console.warn('保存口味偏好失败:', error);
      // 这是提醒配置，不因保存失败阻断预约或离开页面。
      wx.showToast({ title: '保存失败，可稍后重试', icon: 'none' });
    } finally {
      if (sessionScope === currentSessionScope()) this.setData({ saving: false });
    }
  }
});
