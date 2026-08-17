// 家庭相关数据模型与响应归一化工具。

const firstValue = (source, keys, fallback) => {
  if (!source || typeof source !== 'object') return fallback;
  for (let index = 0; index < keys.length; index += 1) {
    const value = source[keys[index]];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const FamilyRole = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  CHEF: 'chef',
  MEMBER: 'member'
});

const ROLE_LABELS = Object.freeze({
  owner: '创建者',
  admin: '管理员',
  chef: '协作者',
  member: '成员'
});

const normalizeRole = (role) => {
  const value = String(role || '').toLowerCase();
  if (value === 'owner' || value === 'admin' || value === 'chef' || value === 'member') return value;
  if (value === 'administrator') return FamilyRole.ADMIN;
  return FamilyRole.MEMBER;
};

const roleLabel = (role) => ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.member;

const normalizeFamily = (raw) => {
  const source = raw && raw.family ? raw.family : raw;
  if (!source || typeof source !== 'object') return null;
  const id = firstValue(source, ['id', 'familyId', 'family_id'], '');
  if (!id) return null;
  const role = normalizeRole(firstValue(source, ['role', 'memberRole', 'member_role'], FamilyRole.MEMBER));
  return {
    ...source,
    id: String(id),
    familyId: String(id),
    name: String(firstValue(source, ['name', 'familyName', 'family_name'], '未命名家庭')),
    timezone: String(firstValue(source, ['timezone', 'timeZone', 'time_zone'], 'Asia/Shanghai')),
    role,
    roleLabel: roleLabel(role),
    isOwner: role === FamilyRole.OWNER || Boolean(source.isOwner || source.is_owner),
    memberCount: Number(firstValue(source, ['memberCount', 'member_count', 'membersCount'], 0)) || 0,
    createdAt: firstValue(source, ['createdAt', 'created_at', 'createTime', 'create_time'], null),
    updatedAt: firstValue(source, ['updatedAt', 'updated_at', 'updateTime', 'update_time'], null),
    initial: String(firstValue(source, ['name', 'familyName', 'family_name'], '未命名家庭')).slice(0, 1)
  };
};

const normalizeMember = (raw) => {
  const source = raw && raw.member ? raw.member : raw;
  if (!source || typeof source !== 'object') return null;
  const userId = firstValue(source, ['userId', 'user_id', 'id'], '');
  if (!userId) return null;
  const role = normalizeRole(firstValue(source, ['role', 'memberRole', 'member_role'], FamilyRole.MEMBER));
  const nickName = String(firstValue(source, ['nickName', 'nickname', 'nick_name', 'name'], '家庭成员'));
  return {
    ...source,
    userId: String(userId),
    familyId: String(firstValue(source, ['familyId', 'family_id'], '')),
    role,
    roleLabel: roleLabel(role),
    nickName,
    initial: nickName.slice(0, 1),
    avatarUrl: String(firstValue(source, ['avatarUrl', 'avatar_url', 'avatar'], '')),
    joinedAt: firstValue(source, ['joinedAt', 'joined_at', 'createTime', 'create_time'], null)
  };
};

const normalizeInvitation = (raw) => {
  const source = raw && raw.invitation ? raw.invitation : raw;
  if (!source || typeof source !== 'object') return null;
  const token = firstValue(source, ['token', 'inviteToken', 'invite_token'], '');
  return {
    ...source,
    id: String(firstValue(source, ['id', 'invitationId', 'invitation_id'], '')),
    token: String(token || ''),
    role: normalizeRole(firstValue(source, ['role'], FamilyRole.MEMBER)),
    roleLabel: roleLabel(firstValue(source, ['role'], FamilyRole.MEMBER)),
    familyId: String(firstValue(source, ['familyId', 'family_id'], '')),
    familyName: String(firstValue(source, ['familyName', 'family_name', 'name'], '')),
    expiresAt: firstValue(source, ['expiresAt', 'expires_at', 'expireTime', 'expire_time'], null),
    status: String(firstValue(source, ['status'], 'pending'))
  };
};

const extractList = (response, keys) => {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  const candidates = keys || ['list', 'families', 'members', 'items'];
  for (let index = 0; index < candidates.length; index += 1) {
    if (Array.isArray(response[candidates[index]])) return response[candidates[index]];
  }
  if (response.data && response.data !== response) return extractList(response.data, candidates);
  return [];
};

const extractFamily = (response) => {
  if (!response || typeof response !== 'object') return null;
  if (response.family) return normalizeFamily(response.family);
  if (response.data && response.data !== response) return extractFamily(response.data);
  return normalizeFamily(response);
};

const extractInvitation = (response) => {
  if (!response || typeof response !== 'object') return null;
  if (response.invitation) return normalizeInvitation(response.invitation);
  if (response.data && response.data !== response) return extractInvitation(response.data);
  return normalizeInvitation(response);
};

module.exports = {
  FamilyRole,
  ROLE_LABELS,
  normalizeRole,
  roleLabel,
  normalizeFamily,
  normalizeMember,
  normalizeInvitation,
  extractList,
  extractFamily,
  extractInvitation
};
