// 当前用户的口味偏好服务。
// http.request 会统一注入 Authorization；有活动家庭时额外发送 X-Family-Id。

const http = require('./http');
const model = require('../models/preferences');

const PREFERENCES_URL = '/api/user/preferences';
const ACTIVE_FAMILY_KEY = 'active_family_id';

const normalizeFamilyId = (value) => {
  if (value && typeof value === 'object') {
    return value.id || value.familyId || value.family_id || '';
  }
  return value;
};

const readGlobalFamilyId = () => {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    const globalData = app && app.globalData;
    const family = globalData && (globalData.currentFamily || globalData.activeFamily || globalData.selectedFamily);
    const value = globalData && (
      globalData.currentFamilyId ||
      globalData.activeFamilyId ||
      globalData.selectedFamilyId ||
      normalizeFamilyId(family)
    );
    const normalized = normalizeFamilyId(value);
    return normalized === undefined || normalized === null ? '' : String(normalized);
  } catch (_) {
    return '';
  }
};

const getCurrentFamilyId = (familyId) => {
  const explicitFamilyId = normalizeFamilyId(familyId);
  if (explicitFamilyId !== undefined && explicitFamilyId !== null && explicitFamilyId !== '') {
    return String(explicitFamilyId);
  }

  const globalFamilyId = readGlobalFamilyId();
  if (globalFamilyId) return globalFamilyId;

  try {
    const stored = wx.getStorageSync(ACTIVE_FAMILY_KEY);
    const normalized = normalizeFamilyId(stored);
    return normalized === undefined || normalized === null ? '' : String(normalized);
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
  if (method === 'GET') {
    return http.getCached(PREFERENCES_URL, payload, {
      resource: 'profile',
      ttlMs: 5 * 60 * 1000
    });
  }
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
