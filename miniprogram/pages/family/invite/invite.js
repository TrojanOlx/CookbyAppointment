const { FamilyService } = require('../../../services/family');
const { normalizeInvitation } = require('../../../models/family');

let invitePreviewRequestId = 0;
let inviteContextRequestId = 0;

const activeFamilyId = () => String(FamilyService.getActiveFamilyId() || '');

Page({
  data: {
    token: '',
    role: 'member',
    roleOptions: [
      { key: 'member', label: '普通成员' },
      { key: 'chef', label: '厨师' },
      { key: 'admin', label: '管理员' }
    ],
    preview: null,
    previewFamily: null,
    invite: null,
    loading: false,
    creating: false,
    accepting: false,
    hasActiveFamily: false,
    familyId: '',
    canCreateInvite: false,
    canInviteAdmin: false,
    canAccept: true,
    isPreview: false,
    errorMessage: '',
    contextLoading: false,
    contextError: '',
    hasContextLoaded: false
  },

  onLoad(options) {
    const rawToken = options && (options.token || options.scene)
      ? String(options.token || options.scene)
      : '';
    let token = rawToken;
    try {
      token = decodeURIComponent(rawToken);
    } catch (error) {
      token = rawToken;
    }
    const isPreview = !!token;
    const familyId = activeFamilyId();
    this.setData({
      token,
      isPreview,
      familyId,
      hasActiveFamily: !!familyId
    });
    if (isPreview) this.loadPreview(token);
    else if (familyId) this.loadInviteContext();
  },

  onShow() {
    if (this.data.isPreview) return;
    const familyId = activeFamilyId();
    const familyChanged = familyId !== this.data.familyId;
    if (familyChanged) {
      inviteContextRequestId += 1;
      this.setData({
        familyId,
        hasActiveFamily: !!familyId,
        canCreateInvite: false,
        canInviteAdmin: false,
        contextLoading: false,
        contextError: '',
        hasContextLoaded: false,
        invite: null
      }, () => {
        if (familyId) this.loadInviteContext();
      });
      return;
    }
    this.setData({ hasActiveFamily: !!familyId });
    if (familyId && !this.data.hasContextLoaded && !this.data.contextLoading) {
      this.loadInviteContext();
    }
  },

  async loadInviteContext() {
    const familyId = activeFamilyId();
    if (!familyId || this.data.contextLoading) return;
    const requestId = ++inviteContextRequestId;
    this.setData({
      familyId,
      hasActiveFamily: true,
      contextLoading: true,
      contextError: ''
    });
    try {
      const family = await FamilyService.detail();
      if (requestId !== inviteContextRequestId || activeFamilyId() !== familyId) return;
      const isOwner = !!(family && (family.isOwner || family.role === 'owner'));
      const canCreateInvite = isOwner || (family && family.role === 'admin');
      this.setData({
        canCreateInvite,
        canInviteAdmin: isOwner,
        roleOptions: isOwner
          ? [{ key: 'member', label: '普通成员' }, { key: 'chef', label: '厨师' }, { key: 'admin', label: '管理员' }]
          : [{ key: 'member', label: '普通成员' }, { key: 'chef', label: '厨师' }],
        role: isOwner ? this.data.role : (this.data.role === 'admin' ? 'member' : this.data.role),
        familyId,
        hasActiveFamily: true,
        hasContextLoaded: true,
        contextError: ''
      });
    } catch (error) {
      console.error('获取家庭权限失败:', error);
      if (requestId !== inviteContextRequestId || activeFamilyId() !== familyId) return;
      this.setData({
        hasContextLoaded: false,
        contextError: error && error.message ? error.message : '家庭权限暂时无法读取，请重试'
      });
    }
    finally {
      if (requestId === inviteContextRequestId && activeFamilyId() === familyId) {
        this.setData({ contextLoading: false });
      }
    }
  },

  retryInviteContext() {
    this.loadInviteContext();
  },

  onRoleChange(event) {
    const role = event.detail && event.detail.key ? event.detail.key : 'member';
    this.setData({ role });
  },

  async loadPreview(token) {
    if (!token || this.data.loading) return;
    const requestId = ++invitePreviewRequestId;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await FamilyService.previewInvite(token);
      if (requestId !== invitePreviewRequestId || this.data.token !== token) return;
      const invitation = result.invitation || normalizeInvitation(result);
      const family = result.family || null;
      if (!invitation && !family) throw new Error('邀请不存在或已失效');
      this.setData({
        preview: invitation,
        previewFamily: family,
        role: invitation && invitation.role ? invitation.role : 'member',
        canAccept: !invitation || !invitation.status || invitation.status === 'active'
      });
    } catch (error) {
      if (requestId !== invitePreviewRequestId || this.data.token !== token) return;
      console.error('获取邀请信息失败:', error);
      this.setData({ errorMessage: error && error.message ? error.message : '邀请不存在或已失效' });
    } finally {
      if (requestId === invitePreviewRequestId && this.data.token === token) {
        this.setData({ loading: false });
      }
    }
  },

  retryPreview() {
    this.loadPreview(this.data.token);
  },

  async createInvite() {
    if (!this.data.canCreateInvite) {
      wx.showToast({ title: '当前家庭角色无邀请权限', icon: 'none' });
      return;
    }
    if (!this.data.hasActiveFamily) {
      wx.showModal({
        title: '还没有选中的家庭',
        content: '请先选择一个家庭，再生成邀请。',
        showCancel: false
      });
      return;
    }
    const familyId = activeFamilyId();
    if (!familyId || familyId !== this.data.familyId) {
      wx.showToast({ title: '家庭已切换，请重新加载', icon: 'none' });
      this.setData({ familyId, hasActiveFamily: !!familyId, hasContextLoaded: false });
      return;
    }
    if (this.data.role === 'admin' && !this.data.canInviteAdmin) {
      wx.showToast({ title: '只有家庭主可以邀请管理员', icon: 'none' });
      return;
    }
    if (this.data.creating) return;
    this.setData({ creating: true, errorMessage: '' });
    try {
      const invite = await FamilyService.createInvite(this.data.role);
      if (activeFamilyId() !== familyId) {
        wx.showToast({ title: '家庭已切换，请重新生成邀请', icon: 'none' });
        return;
      }
      if (!invite || !invite.token) throw new Error('邀请生成失败，请稍后重试');
      this.setData({ invite });
      wx.setClipboardData({
        data: invite.token,
        success: () => wx.showToast({ title: '邀请码已复制', icon: 'success', duration: 1400 })
      });
    } catch (error) {
      console.error('生成邀请失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '生成邀请失败', icon: 'none' });
    } finally {
      this.setData({ creating: false });
    }
  },

  copyToken() {
    const token = this.data.invite && this.data.invite.token;
    if (!token) return;
    wx.setClipboardData({
      data: token,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success', duration: 1400 })
    });
  },

  async acceptInvite() {
    if (!this.data.token || this.data.accepting) return;
    this.setData({ accepting: true });
    try {
      const result = await FamilyService.acceptInvite(this.data.token);
      if (!result.family || !result.family.id) throw new Error('加入结果缺少家庭信息');
      FamilyService.setActiveFamilyId(result.family.id);
      wx.showToast({ title: '已加入家庭', icon: 'success', duration: 1200 });
      setTimeout(() => wx.redirectTo({ url: '/pages/family/index/index' }), 500);
    } catch (error) {
      console.error('加入家庭失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '加入失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ accepting: false });
    }
  },

  openMembers() {
    wx.navigateTo({ url: '/pages/family/members/members' });
  },

  openList() {
    wx.redirectTo({ url: '/pages/family/index/index' });
  },

  onShareAppMessage() {
    const token = this.data.token || (this.data.invite && this.data.invite.token) || '';
    return {
      title: '邀请你加入家庭小岛',
      path: `/pages/family/invite/invite?token=${encodeURIComponent(token)}`
    };
  }
});
