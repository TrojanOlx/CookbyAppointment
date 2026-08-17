const { FamilyService } = require('../../../services/family');
const { FamilyRole } = require('../../../models/family');

Page({
  data: {
    family: null,
    members: [],
    loading: false,
    hasActiveFamily: false,
    currentUserId: '',
    currentUserOpenid: '',
    actorRole: FamilyRole.MEMBER,
    canManage: false,
    isOwner: false,
    refreshing: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      currentUserId: String(userInfo.id || userInfo.userId || ''),
      currentUserOpenid: String(userInfo.openid || ''),
      hasActiveFamily: !!FamilyService.getActiveFamilyId()
    });
  },

  onShow() {
    const hasActiveFamily = !!FamilyService.getActiveFamilyId();
    this.setData({ hasActiveFamily });
    if (hasActiveFamily) this.loadMembers();
  },

  async loadMembers() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const [familyResult, membersResult] = await Promise.all([
        FamilyService.detail().catch(() => null),
        FamilyService.members()
      ]);
      const members = Array.isArray(membersResult) ? membersResult : [];
      const current = members.find(item => this.isCurrentMember(item));
      const family = familyResult || {
        id: FamilyService.getActiveFamilyId(),
        name: '当前家庭',
        role: current ? current.role : FamilyRole.MEMBER
      };
      const role = family.role || (current && current.role) || FamilyRole.MEMBER;
      const isOwner = role === FamilyRole.OWNER || !!family.isOwner;
      const canManage = isOwner || role === FamilyRole.ADMIN;
      const decorated = members.map(item => this.decorateMember(item, canManage, isOwner, role));
      this.setData({
        family,
        members: decorated,
        canManage,
        isOwner,
        actorRole: role
      });
    } catch (error) {
      console.error('获取家庭成员失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '成员加载失败', icon: 'none' });
      this.setData({ members: [] });
    } finally {
      this.setData({ loading: false, refreshing: false });
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    }
  },

  isCurrentMember(member) {
    if (!member) return false;
    const userInfo = wx.getStorageSync('userInfo') || {};
    const userId = String(this.data.currentUserId || userInfo.id || userInfo.userId || '');
    const openid = String(this.data.currentUserOpenid || userInfo.openid || '');
    return (userId && String(member.userId) === userId)
      || (openid && String(member.openid || '') === openid);
  },

  decorateMember(member, canManage, isOwner, actorRole) {
    const isCurrent = this.isCurrentMember(member);
    const roleCanBeManaged = isOwner
      ? member.role !== FamilyRole.OWNER
      : (actorRole === FamilyRole.ADMIN && (member.role === FamilyRole.CHEF || member.role === FamilyRole.MEMBER));
    return {
      ...member,
      isCurrent,
      canEdit: canManage && !isCurrent && roleCanBeManaged,
      canTransfer: isOwner && !isCurrent && member.role !== FamilyRole.OWNER
    };
  },

  onPullDownRefresh() {
    if (!this.data.hasActiveFamily) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ refreshing: true });
    this.loadMembers();
  },

  openInvite() {
    if (!this.data.canManage) {
      wx.showToast({ title: '只有管理员可以邀请成员', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/family/invite/invite' });
  },

  openFamilyList() {
    wx.redirectTo({ url: '/pages/family/index/index' });
  },

  openMemberActions(event) {
    if (!this.data.canManage) return;
    const userId = event.currentTarget.dataset.id;
    const role = event.currentTarget.dataset.role;
    const current = this.data.members.find(item => item.userId === userId);
    if (!userId || !current || current.isCurrent || current.role === FamilyRole.OWNER) return;
    let itemList;
    if (this.data.isOwner) {
      itemList = role === FamilyRole.ADMIN
        ? ['设为普通成员', '移出家庭']
        : role === FamilyRole.CHEF
          ? ['设为管理员', '设为普通成员', '移出家庭']
          : ['设为管理员', '设为协作者', '移出家庭'];
    } else {
      itemList = role === FamilyRole.CHEF ? ['设为普通成员', '移出家庭'] : ['设为协作者', '移出家庭'];
    }
    wx.showActionSheet({
      itemList,
      success: (result) => {
        if (this.data.isOwner && role === FamilyRole.ADMIN) {
          if (result.tapIndex === 0) this.updateRole(userId, FamilyRole.MEMBER);
          if (result.tapIndex === 1) this.removeMember(userId);
        } else if (this.data.isOwner && role === FamilyRole.CHEF) {
          if (result.tapIndex === 0) this.updateRole(userId, FamilyRole.ADMIN);
          if (result.tapIndex === 1) this.updateRole(userId, FamilyRole.MEMBER);
          if (result.tapIndex === 2) this.removeMember(userId);
        } else if (this.data.isOwner) {
          if (result.tapIndex === 0) this.updateRole(userId, FamilyRole.ADMIN);
          if (result.tapIndex === 1) this.updateRole(userId, FamilyRole.CHEF);
          if (result.tapIndex === 2) this.removeMember(userId);
        } else if (role === FamilyRole.CHEF) {
          if (result.tapIndex === 0) this.updateRole(userId, FamilyRole.MEMBER);
          if (result.tapIndex === 1) this.removeMember(userId);
        } else {
          if (result.tapIndex === 0) this.updateRole(userId, FamilyRole.CHEF);
          if (result.tapIndex === 1) this.removeMember(userId);
        }
      }
    });
  },

  async updateRole(userId, role) {
    try {
      await FamilyService.updateMemberRole(userId, role);
      const roleText = role === FamilyRole.ADMIN ? '管理员' : role === FamilyRole.CHEF ? '协作者' : '普通成员';
      wx.showToast({ title: `已设为${roleText}`, icon: 'success' });
      this.loadMembers();
    } catch (error) {
      console.error('更新成员角色失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '角色更新失败', icon: 'none' });
    }
  },

  removeMember(userId) {
    wx.showModal({
      title: '移出家庭',
      content: '移出后，该成员将不能继续查看这个家庭的数据。',
      confirmText: '确认移出',
      confirmColor: '#e05a5a',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await FamilyService.removeMember(userId);
          wx.showToast({ title: '成员已移出', icon: 'success' });
          this.loadMembers();
        } catch (error) {
          console.error('移出成员失败:', error);
          wx.showToast({ title: error && error.message ? error.message : '移出失败', icon: 'none' });
        }
      }
    });
  },

  transferOwnership(event) {
    if (!this.data.isOwner) return;
    const userId = event.currentTarget.dataset.id;
    if (!userId) return;
    const member = this.data.members.find(item => item.userId === userId);
    if (!member) return;
    wx.showModal({
      title: '转让创建者身份',
      content: `确定将“${member.nickName}”设为创建者吗？转让后你仍是成员，但不能再管理家庭。`,
      confirmText: '确认转让',
      confirmColor: '#e59266',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await FamilyService.transferOwnership(userId);
          wx.showToast({ title: '创建者身份已转让', icon: 'success' });
          this.loadMembers();
        } catch (error) {
          console.error('转让创建者身份失败:', error);
          wx.showToast({ title: error && error.message ? error.message : '转让失败', icon: 'none' });
        }
      }
    });
  },

  leaveFamily() {
    if (this.data.isOwner) {
      wx.showModal({
        title: '暂不能退出',
        content: '你是创建者，请先把创建者身份转让给其他成员。',
        showCancel: false
      });
      return;
    }
    wx.showModal({
      title: '退出家庭',
      content: '退出后将无法继续查看这个家庭的数据，确定退出吗？',
      confirmText: '确认退出',
      confirmColor: '#e05a5a',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await FamilyService.leave();
          FamilyService.clearActiveFamilyId();
          wx.showToast({ title: '已退出家庭', icon: 'success', duration: 1000 });
          setTimeout(() => this.openFamilyList(), 450);
        } catch (error) {
          console.error('退出家庭失败:', error);
          wx.showToast({ title: error && error.message ? error.message : '退出失败', icon: 'none' });
        }
      }
    });
  }
});
