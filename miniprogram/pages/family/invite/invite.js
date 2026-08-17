const { FamilyService } = require('../../../services/family');
const { normalizeInvitation } = require('../../../models/family');

Page({
  data: {
    token: '',
    role: 'member',
    roleOptions: [
      { key: 'member', label: '普通成员' },
      { key: 'chef', label: '协作者' },
      { key: 'admin', label: '管理员' }
    ],
    preview: null,
    previewFamily: null,
    invite: null,
    loading: false,
    creating: false,
    accepting: false,
    hasActiveFamily: false,
    canCreateInvite: false,
    canInviteAdmin: false,
    canAccept: true,
    isPreview: false,
    errorMessage: ''
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
    this.setData({
      token,
      isPreview,
      hasActiveFamily: !!FamilyService.getActiveFamilyId()
    });
    if (isPreview) this.loadPreview(token);
    else if (this.data.hasActiveFamily) this.loadInviteContext();
  },

  async loadInviteContext() {
    try {
      const family = await FamilyService.detail();
      const isOwner = !!(family && (family.isOwner || family.role === 'owner'));
      const canCreateInvite = isOwner || (family && family.role === 'admin');
      this.setData({
        canCreateInvite,
        canInviteAdmin: isOwner,
        roleOptions: isOwner
          ? [{ key: 'member', label: '普通成员' }, { key: 'chef', label: '协作者' }, { key: 'admin', label: '管理员' }]
          : [{ key: 'member', label: '普通成员' }, { key: 'chef', label: '协作者' }],
        role: isOwner ? this.data.role : (this.data.role === 'admin' ? 'member' : this.data.role)
      });
    } catch (error) {
      console.error('获取家庭权限失败:', error);
    }
  },

  onRoleChange(event) {
    const role = event.detail && event.detail.key ? event.detail.key : 'member';
    this.setData({ role });
  },

  async loadPreview(token) {
    if (!token || this.data.loading) return;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await FamilyService.previewInvite(token);
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
      console.error('获取邀请信息失败:', error);
      this.setData({ errorMessage: error && error.message ? error.message : '邀请不存在或已失效' });
    } finally {
      this.setData({ loading: false });
    }
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
    if (this.data.role === 'admin' && !this.data.canInviteAdmin) {
      wx.showToast({ title: '只有创建者可以邀请管理员', icon: 'none' });
      return;
    }
    if (this.data.creating) return;
    this.setData({ creating: true, errorMessage: '' });
    try {
      const invite = await FamilyService.createInvite(this.data.role);
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
