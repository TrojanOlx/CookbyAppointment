// 公共多家庭服务。
// 家庭上下文通过 wx storage 的 active_family_id 选择，并由 X-Family-Id 传给后端。

const http = require('./http');
const model = require('../models/family');

const ACTIVE_FAMILY_KEY = 'active_family_id';

const getActiveFamilyId = () => {
  const value = wx.getStorageSync(ACTIVE_FAMILY_KEY);
  return value === undefined || value === null ? '' : String(value);
};

const setActiveFamilyId = (familyId) => {
  if (familyId === undefined || familyId === null || familyId === '') {
    wx.removeStorageSync(ACTIVE_FAMILY_KEY);
    return '';
  }
  const value = String(familyId);
  const previous = getActiveFamilyId();
  wx.setStorageSync(ACTIVE_FAMILY_KEY, value);
  if (previous && previous !== value) {
    ['dish_list_cache', 'inventory_cache', 'appointment_cache', 'shopping_cache'].forEach((key) => {
      wx.removeStorageSync(key);
    });
  }
  return value;
};

const clearActiveFamilyId = () => {
  wx.removeStorageSync(ACTIVE_FAMILY_KEY);
};

const familyRequest = (url, method, data, includeFamily) => {
  const useFamily = includeFamily !== false;
  const familyId = getActiveFamilyId();
  if (useFamily && !familyId) {
    return Promise.reject(new Error('请先选择一个家庭'));
  }
  const options = { url, method, data };
  if (useFamily) options.header = { 'X-Family-Id': familyId };
  return http.request(options);
};

class FamilyService {
  static getActiveFamilyId() {
    return getActiveFamilyId();
  }

  static setActiveFamilyId(familyId) {
    return setActiveFamilyId(familyId);
  }

  static clearActiveFamilyId() {
    clearActiveFamilyId();
  }

  static async list() {
    const response = await familyRequest('/api/family/list', 'GET', undefined, false);
    return model.extractList(response, ['list', 'families', 'items'])
      .map(model.normalizeFamily)
      .filter(Boolean);
  }

  static async getFamilyList() {
    return this.list();
  }

  static async create(name, timezone) {
    const payload = name && typeof name === 'object'
      ? { ...name }
      : { name: String(name || '').trim() };
    if (payload.name !== undefined) payload.name = String(payload.name || '').trim();
    if (timezone && typeof name !== 'object') payload.timezone = timezone;
    const response = await familyRequest('/api/family/create', 'POST', payload, false);
    return model.extractFamily(response);
  }

  static async createFamily(name, timezone) {
    return this.create(name, timezone);
  }

  static async detail() {
    const response = await familyRequest('/api/family/detail', 'GET');
    return model.extractFamily(response);
  }

  static async getFamilyDetail() {
    return this.detail();
  }

  static async update(payload) {
    const data = {};
    if (payload && payload.name !== undefined) data.name = String(payload.name).trim();
    if (payload && payload.timezone) data.timezone = payload.timezone;
    const response = await familyRequest('/api/family/detail', 'PUT', data);
    return model.extractFamily(response);
  }

  static async updateFamily(payload) {
    return this.update(payload);
  }

  static async remove() {
    return familyRequest('/api/family/detail', 'DELETE');
  }

  static async deleteFamily() {
    return this.remove();
  }

  static async createInvite(role) {
    const response = await familyRequest('/api/family/invite', 'POST', {
      role: model.normalizeRole(role || model.FamilyRole.MEMBER)
    });
    return model.extractInvitation(response);
  }

  static async createInvitation(role) {
    return this.createInvite(role);
  }

  static async previewInvite(token) {
    const response = await familyRequest('/api/family/invite/preview', 'GET', { token }, false);
    const invitation = model.extractInvitation(response);
    const family = model.extractFamily(response);
    return {
      ...(response && typeof response === 'object' ? response : {}),
      invitation,
      family
    };
  }

  static async previewInvitation(token) {
    return this.previewInvite(token);
  }

  static async acceptInvite(token) {
    const response = await familyRequest('/api/family/invite/accept', 'POST', { token }, false);
    const family = model.extractFamily(response);
    if (family && family.id) setActiveFamilyId(family.id);
    return { response, family };
  }

  static async acceptInvitation(token) {
    return this.acceptInvite(token);
  }

  static async revokeInvite(invitationId) {
    return familyRequest('/api/family/invite/revoke', 'POST', { invitationId });
  }

  static async revokeInvitation(invitationId) {
    return this.revokeInvite(invitationId);
  }

  static async members() {
    const response = await familyRequest('/api/family/members', 'GET');
    return model.extractList(response, ['list', 'members', 'items'])
      .map(model.normalizeMember)
      .filter(Boolean);
  }

  static async getMembers() {
    return this.members();
  }

  static async updateMemberRole(userId, role) {
    return familyRequest('/api/family/member/role', 'PUT', {
      userId,
      role: model.normalizeRole(role)
    });
  }

  static async changeMemberRole(userId, role) {
    return this.updateMemberRole(userId, role);
  }

  static async removeMember(userId) {
    const query = encodeURIComponent(String(userId || ''));
    return familyRequest(`/api/family/member?userId=${query}`, 'DELETE');
  }

  static async deleteMember(userId) {
    return this.removeMember(userId);
  }

  static async leave() {
    return familyRequest('/api/family/leave', 'POST');
  }

  static async leaveFamily() {
    return this.leave();
  }

  static async transferOwnership(userId) {
    return familyRequest('/api/family/transfer', 'POST', { userId });
  }

  static async transfer(userId) {
    return this.transferOwnership(userId);
  }
}

module.exports = {
  ACTIVE_FAMILY_KEY,
  FamilyService,
  getActiveFamilyId,
  setActiveFamilyId,
  clearActiveFamilyId
};
