// 个人口味偏好模型。
// 接口只保存标签和辣度；预设标签由前端提供，用户也可以补充自定义标签。

const PRESET_TAGS = Object.freeze({
  allergies: Object.freeze(['花生', '坚果', '牛奶', '鸡蛋', '海鲜', '芝麻', '麸质']),
  dislikes: Object.freeze(['香菜', '葱', '蒜', '芹菜', '肥肉', '内脏', '菌菇']),
  likes: Object.freeze(['鸡肉', '牛肉', '海鲜', '绿叶菜', '汤', '面食'])
});

const SPICY_LEVELS = Object.freeze([
  { value: '', label: '未设置' },
  { value: 'none', label: '不辣' },
  { value: 'mild', label: '微辣' },
  { value: 'medium', label: '中辣' },
  { value: 'hot', label: '特辣' }
]);

const DEFAULT_PREFERENCES = Object.freeze({
  allergies: Object.freeze([]),
  dislikes: Object.freeze([]),
  likes: Object.freeze([]),
  spicyLevel: ''
});

const firstValue = (source, keys, fallback) => {
  if (!source || typeof source !== 'object') return fallback;
  for (let index = 0; index < keys.length; index += 1) {
    const value = source[keys[index]];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const unwrap = (value) => {
  if (!value || typeof value !== 'object') return {};
  if (value.preferences && typeof value.preferences === 'object' && !Array.isArray(value.preferences)) {
    return value.preferences;
  }
  if (value.data && typeof value.data === 'object') {
    if (
      value.data.preferences &&
      typeof value.data.preferences === 'object' &&
      !Array.isArray(value.data.preferences)
    ) {
      return value.data.preferences;
    }
    return value.data;
  }
  return value;
};

const toTagArray = (value) => {
  let values = value;
  if (typeof values === 'string') {
    values = values.split(/[，,、\n]/g);
  }
  if (!Array.isArray(values)) return [];

  const seen = Object.create(null);
  return values
    .map((item) => {
      if (item && typeof item === 'object') {
        return item.label || item.name || item.value || '';
      }
      return item;
    })
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
};

const normalizeSpicyLevel = (value) => {
  const raw = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  const aliases = {
    '': '',
    none: 'none',
    '0': 'none',
    '不辣': 'none',
    mild: 'mild',
    '1': 'mild',
    '微辣': 'mild',
    medium: 'medium',
    '2': 'medium',
    '中辣': 'medium',
    hot: 'hot',
    '3': 'hot',
    '特辣': 'hot'
  };
  return Object.prototype.hasOwnProperty.call(aliases, raw) ? aliases[raw] : '';
};

const normalizePreferences = (value) => {
  const source = unwrap(value);
  return {
    allergies: toTagArray(firstValue(source, ['allergies', 'allergyTags', 'allergenTags', 'allergy'], [])),
    dislikes: toTagArray(firstValue(source, ['dislikes', 'dislikeTags', 'avoidTags', 'notEatTags', 'notEat'], [])),
    likes: toTagArray(firstValue(source, ['likes', 'likeTags', 'favoriteTags', 'preferTags'], [])),
    spicyLevel: normalizeSpicyLevel(firstValue(source, ['spicyLevel', 'spiceLevel', 'spicy', 'chiliLevel'], ''))
  };
};

const createDefaultPreferences = () => ({
  allergies: [],
  dislikes: [],
  likes: [],
  spicyLevel: DEFAULT_PREFERENCES.spicyLevel
});

const serializePreferences = (value) => {
  const normalized = normalizePreferences(value);
  return {
    allergies: normalized.allergies,
    dislikes: normalized.dislikes,
    likes: normalized.likes,
    spicyLevel: normalized.spicyLevel || 'none'
  };
};

const hasPreferencePayload = (value) => {
  const source = unwrap(value);
  return Boolean(
    source && typeof source === 'object' && (
      Object.prototype.hasOwnProperty.call(source, 'allergies') ||
      Object.prototype.hasOwnProperty.call(source, 'allergyTags') ||
      Object.prototype.hasOwnProperty.call(source, 'dislikes') ||
      Object.prototype.hasOwnProperty.call(source, 'dislikeTags') ||
      Object.prototype.hasOwnProperty.call(source, 'likes') ||
      Object.prototype.hasOwnProperty.call(source, 'likeTags') ||
      Object.prototype.hasOwnProperty.call(source, 'spicyLevel') ||
      Object.prototype.hasOwnProperty.call(source, 'spiceLevel')
    )
  );
};

module.exports = {
  DEFAULT_PREFERENCES,
  PRESET_TAGS,
  SPICY_LEVELS,
  createDefaultPreferences,
  normalizePreferences,
  serializePreferences,
  hasPreferencePayload
};
