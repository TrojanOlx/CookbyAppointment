const { FamilyService } = require('../../../services/family');
const { FamilyRole } = require('../../../models/family');

let membersRequestId = 0;

const activeFamilyId = () => String(FamilyService.getActiveFamilyId() || '');

Page({
  data: {
    family: null,
    familyId: '',
    members: [],
    loading: false,
    loadError: '',
    hasActiveFamily: false,
    currentUserId: '',
    currentUserOpenid: '',
    actorRole: FamilyRole.MEMBER,
    canManage: false,
    isOwner: false,
    refreshing: false,
    leaving: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const familyId = activeFamilyId();
    this.setData({
      currentUserId: String(userInfo.id || userInfo.userId || ''),
      currentUserOpenid: String(userInfo.openid || ''),
      familyId,
      hasActiveFamily: !!familyId
    });
  },

  onShow() {
    const familyId = activeFamilyId();
    const familyChanged = familyId !== this.data.familyId;
    if (familyChanged) {
      membersRequestId += 1;
      this.setData({
        familyId,
        hasActiveFamily: !!familyId,
        family: null,
        members: [],
        loadError: '',
        canManage: false,
        isOwner: false,
        actorRole: FamilyRole.MEMBER,
        loading: false
      }, () => {
        if (familyId) this.loadMembers();
      });
      return;
    }
    this.setData({ hasActiveFamily: !!familyId });
    if (familyId) this.loadMembers();
  },

  async loadMembers() {
    if (this.data.loading) return;
    const familyId = activeFamilyId();
    if (!familyId) {
      membersRequestId += 1;
      this.setData({
        familyId: '',
        hasActiveFamily: false,
        family: null,
        members: [],
        loadError: '',
        canManage: false,
        isOwner: false,
        actorRole: FamilyRole.MEMBER,
        loading: false,
        refreshing: false
      });
      return;
    }
    const requestId = ++membersRequestId;
    this.setData({ loading: true, familyId, hasActiveFamily: true, loadError: '' });
    try {
      const [familyResult, membersResult] = await Promise.all([
        FamilyService.detail().catch(() => null),
        FamilyService.members()
      ]);
      if (requestId !== membersRequestId || activeFamilyId() !== familyId) return;
      const members = Array.isArray(membersResult) ? membersResult : [];
      const current = members.find(item => this.isCurrentMember(item));
      const family = familyResult || {
        id: familyId,
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
        actorRole: role,
        familyId,
        hasActiveFamily: true,
        loadError: ''
      });
    } catch (error) {
      if (requestId !== membersRequestId || activeFamilyId() !== familyId) return;
      console.error('获取家庭成员失败:', error);
      const message = error && error.message ? error.message : '成员加载失败，请重试';
      this.setData({ loadError: message });
      wx.showToast({ title: error && error.message ? error.message : '成员加载失败', icon: 'none' });
    } finally {
      if (requestId === membersRequestId && activeFamilyId() === familyId) {
        this.setData({ loading: false, refreshing: false });
        if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      }
    }
  },

  retryLoad() {
    this.loadMembers();
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
      wx.showToast({ title: '只有家庭主或管理员可以邀请成员', icon: 'none' });
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
          : ['设为管理员', '设为厨师', '移出家庭'];
    } else {
      itemList = role === FamilyRole.CHEF ? ['设为普通成员', '移出家庭'] : ['设为厨师', '移出家庭'];
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
      const roleText = role === FamilyRole.ADMIN ? '管理员' : role === FamilyRole.CHEF ? '厨师' : '普通成员';
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
      title: '转让家庭主身份',
      content: `确定将“${member.nickName}”设为家庭主吗？转让后你仍是成员，但不能再管理家庭。`,
      confirmText: '确认转让',
      confirmColor: '#e59266',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await FamilyService.transferOwnership(userId);
          wx.showToast({ title: '家庭主身份已转让', icon: 'success' });
          this.loadMembers();
        } catch (error) {
          console.error('转让家庭主身份失败:', error);
          wx.showToast({ title: error && error.message ? error.message : '转让失败', icon: 'none' });
        }
      }
    });
  },

  leaveFamily() {
    if (this.data.isOwner) {
      wx.showModal({
        title: '解散家庭',
        content: '解散后，所有成员将立即失去这个家庭的访问权限，未使用的邀请会失效，采购清单会归档。家庭历史和审计记录仍会保留。',
        confirmText: '继续解散',
        confirmColor: '#e05a5a',
        success: (result) => {
          if (!result.confirm) return;
          const familyName = (this.data.family && this.data.family.name) || '当前家庭';
          wx.showModal({
            title: '最后确认',
            content: `确定解散“${familyName}”吗？此操作不可撤销。`,
            confirmText: '确认解散',
            confirmColor: '#e05a5a',
            success: async (finalResult) => {
              if (!finalResult.confirm || this.data.leaving) return;
              const familyId = activeFamilyId();
              if (!familyId || familyId !== this.data.familyId) {
                wx.showToast({ title: '家庭已切换，请重新操作', icon: 'none' });
                return;
              }
              this.setData({ leaving: true });
              try {
                await FamilyService.remove();
                membersRequestId += 1;
                FamilyService.clearActiveFamilyId();
                wx.showToast({ title: '家庭已解散', icon: 'success', duration: 1000 });
                setTimeout(() => this.openFamilyList(), 450);
              } catch (error) {
                console.error('解散家庭失败:', error);
                wx.showToast({ title: error && error.message ? error.message : '解散失败', icon: 'none' });
              } finally {
                this.setData({ leaving: false });
              }
            }
          });
        }
      });
      return;
    }
    wx.showModal({
      title: '退出家庭',
      content: '退出后将无法继续查看这个家庭的数据，确定退出吗？',
      confirmText: '确认退出',
      confirmColor: '#e05a5a',
      success: async (result) => {
        if (!result.confirm || this.data.leaving) return;
        this.setData({ leaving: true });
        try {
          await FamilyService.leave();
          membersRequestId += 1;
          FamilyService.clearActiveFamilyId();
          wx.showToast({ title: '已退出家庭', icon: 'success', duration: 1000 });
          setTimeout(() => this.openFamilyList(), 450);
        } catch (error) {
          console.error('退出家庭失败:', error);
          wx.showToast({ title: error && error.message ? error.message : '退出失败', icon: 'none' });
        } finally {
          this.setData({ leaving: false });
        }
      }
    });
  }
});
