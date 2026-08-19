// 当前家庭角色读取工具。角色权限最终由服务端校验，这里只负责控制小程序中的可见操作。
const { FamilyService } = require('./family');
const { FamilyRole, normalizeRole } = require('../models/family');

function readStoredRole(familyId) {
  const candidates = [
    wx.getStorageSync('active_family'),
    wx.getStorageSync('active_family_role'),
    wx.getStorageSync('family_role')
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index];
    if (!value) continue;
    const item = typeof value === 'string' ? { role: value } : value;
    const storedFamilyId = item.familyId || item.family_id || item.id || '';
    if (!storedFamilyId || String(storedFamilyId) !== String(familyId)) continue;
    const role = item.role || item.memberRole || item.member_role;
    if (role) return normalizeRole(role);
  }
  return '';
}

async function getFamilyRole() {
  const token = String(wx.getStorageSync('token') || '');
  if (!token) return '';
  const familyId = FamilyService.getActiveFamilyId();
  if (!familyId) return '';

  const storedRole = readStoredRole(familyId);
  if (storedRole) return storedRole;

  try {
    const families = await FamilyService.list();
    if (String(wx.getStorageSync('token') || '') !== token) return '';
    if (String(FamilyService.getActiveFamilyId()) !== String(familyId)) return '';
    const active = (families || []).find(item => String(item.id) === String(familyId));
    return active ? normalizeRole(active.role) : '';
  } catch (error) {
    console.warn('读取家庭角色失败:', error);
    return '';
  }
}

function canManageFamily(role) {
  return role === FamilyRole.OWNER || role === FamilyRole.ADMIN || role === FamilyRole.CHEF;
}

async function getFamilyRoleContext() {
  const role = await getFamilyRole();
  return {
    role,
    canManage: canManageFamily(role),
    canManageMenu: canManageFamily(role),
    canManageAppointments: canManageFamily(role)
  };
}

module.exports = {
  getFamilyRole,
  canManageFamily,
  getFamilyRoleContext
};
