// 当前用户的口味偏好服务。
// http.request 会统一注入 Authorization；有活动家庭时额外发送 X-Family-Id。

const http = require('./http');
const model = require('../models/preferences');

const PREFERENCES_URL = '/api/user/preferences';
const ACTIVE_FAMILY_KEY = 'active_family_id';

const readGlobalFamilyId = () => {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    const globalData = app && app.globalData;
    const family = globalData && (globalData.currentFamily || globalData.activeFamily || globalData.selectedFamily);
    const value = globalData && (
      globalData.currentFamilyId ||
      globalData.activeFamilyId ||
      globalData.selectedFamilyId ||
      (family && (family.id || family.familyId))
    );
    return value === undefined || value === null ? '' : String(value);
  } catch (_) {
    return '';
  }
};

const getCurrentFamilyId = (familyId) => {
  if (familyId !== undefined && familyId !== null && familyId !== '') return String(familyId);

  const globalFamilyId = readGlobalFamilyId();
  if (globalFamilyId) return globalFamilyId;

  try {
    const stored = wx.getStorageSync(ACTIVE_FAMILY_KEY);
    return stored === undefined || stored === null ? '' : String(stored);
  } catch (_) {
    return '';
  }
};

const buildHeaders = (familyId) => {
  const id = getCurrentFamilyId(familyId);
  return id ? { 'X-Family-Id': id } : {};
};

const requestPreferences = (method, payload, familyId) => {
  const options = {
    url: PREFERENCES_URL,
    method,
    header: buildHeaders(familyId)
  };
  if (payload !== undefined) options.data = payload;
  return http.request(options);
};

class PreferencesService {
  static async getPreferences(familyId) {
    const response = await requestPreferences('GET', undefined, familyId);
    return model.normalizePreferences(response);
  }

  static async get(familyId) {
    return this.getPreferences(familyId);
  }

  static async updatePreferences(preferences, familyId) {
    const payload = model.serializePreferences(preferences);
    const response = await requestPreferences('PUT', payload, familyId);
    return model.hasPreferencePayload(response) ? model.normalizePreferences(response) : payload;
  }

  static async savePreferences(preferences, familyId) {
    return this.updatePreferences(preferences, familyId);
  }

  static async save(preferences, familyId) {
    return this.updatePreferences(preferences, familyId);
  }

  static async update(preferences, familyId) {
    return this.updatePreferences(preferences, familyId);
  }
}

module.exports = {
  ACTIVE_FAMILY_KEY,
  PREFERENCES_URL,
  PreferencesService,
  getCurrentFamilyId,
  buildHeaders
};
