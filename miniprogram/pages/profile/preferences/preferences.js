const { PreferencesService, getCurrentFamilyId } = require('../../../services/preferences');
const preferenceModel = require('../../../models/preferences');

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
    familyId: '',
    loading: false,
    saving: false,
    dirty: false
  },

  onLoad(options) {
    const queryFamilyId = options && (options.familyId || options.family_id);
    const familyId = getCurrentFamilyId(queryFamilyId);
    this.setData({ familyId });
    wx.setNavigationBarTitle({ title: '口味偏好' });
    this.loadPreferences();
  },

  onPullDownRefresh() {
    this.loadPreferences(true);
  },

  async loadPreferences(fromRefresh) {
    if (this.data.loading && !fromRefresh) return;
    this.setData({ loading: true });

    try {
      const preferences = await PreferencesService.getPreferences(this.data.familyId);
      this.applyPreferences(preferences);
    } catch (error) {
      console.warn('加载口味偏好失败:', error);
      // 偏好是辅助提醒，接口暂时不可用时仍允许浏览和编辑本地表单。
      wx.showToast({ title: '偏好暂时无法加载', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  applyPreferences(value) {
    const preferences = preferenceModel.normalizePreferences(value);
    this.setData({
      categories: createCategoryState(preferences),
      spicyLevel: preferences.spicyLevel,
      spicyLabel: spicyLabel(preferences.spicyLevel),
      dirty: false
    });
  },

  toggleTag(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    const tagIndex = Number(event.currentTarget.dataset.tagIndex);
    const category = this.data.categories[categoryIndex];
    const tag = category && category.tags[tagIndex];
    if (!tag) return;

    this.setData({
      [`categories[${categoryIndex}].tags[${tagIndex}].selected`]: !tag.selected,
      dirty: true
    });
  },

  onCustomInput(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    this.setData({
      [`categories[${categoryIndex}].customInput`]: event.detail.value || ''
    });
  },

  addCustomTag(event) {
    const categoryIndex = Number(event.currentTarget.dataset.categoryIndex);
    const category = this.data.categories[categoryIndex];
    const label = String((category && category.customInput) || '').trim();
    if (!category || !label) return;

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
    this.setData({ saving: true });

    const payload = this.collectPreferences();
    try {
      const response = await PreferencesService.updatePreferences(payload, this.data.familyId);
      if (preferenceModel.hasPreferencePayload(response)) {
        this.applyPreferences(response);
      } else {
        this.setData({ dirty: false });
      }
      wx.showToast({ title: '偏好已保存', icon: 'success' });
    } catch (error) {
      console.warn('保存口味偏好失败:', error);
      // 这是提醒配置，不因保存失败阻断预约或离开页面。
      wx.showToast({ title: '保存失败，可稍后重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
