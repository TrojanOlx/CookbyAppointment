const { FamilyService } = require('../../../services/family');
const { normalizeInvitation } = require('../../../models/family');
const { downloadInviteCode, removeLocalInviteCode } = require('./services/inviteCode');
const { createFamilyInviteShareContent } = require('../../../utils/share');

let invitePreviewRequestId = 0;
let inviteContextRequestId = 0;
let inviteCodeRequestId = 0;
let inviteCreateRequestId = 0;
let inviteAcceptRequestId = 0;

const activeFamilyId = () => String(FamilyService.getActiveFamilyId() || '');
const authToken = () => String(wx.getStorageSync('token') || '');

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
    hasContextLoaded: false,
    inviteCodePath: '',
    inviteCodeLoading: false,
    inviteCodeError: ''
  },

  onLoad(options) {
    this._authToken = authToken();
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
    if (isPreview) {
      if (!wx.getStorageSync('token')) {
        wx.setStorageSync('redirectUrl', `/pages/family/invite/invite?token=${encodeURIComponent(token)}`);
      }
      this.loadPreview(token);
    }
    else if (familyId) this.loadInviteContext();
  },

  onShow() {
    const currentAuthToken = authToken();
    const authChanged = this._authToken !== undefined && this._authToken !== currentAuthToken;
    this._authToken = currentAuthToken;
    if (authChanged) {
      invitePreviewRequestId += 1;
      inviteContextRequestId += 1;
      inviteCreateRequestId += 1;
      inviteAcceptRequestId += 1;
      inviteCodeRequestId += 1;
      removeLocalInviteCode(this.data.inviteCodePath);
      if (this.data.isPreview) {
        this.setData({
          preview: null,
          previewFamily: null,
          errorMessage: '',
          loading: false,
          accepting: false,
          inviteCodePath: '',
          inviteCodeLoading: false
        }, () => {
          if (this.data.token) this.loadPreview(this.data.token);
        });
        return;
      }
      const familyId = activeFamilyId();
      this.setData({
        familyId,
        hasActiveFamily: !!familyId,
        canCreateInvite: false,
        canInviteAdmin: false,
        contextLoading: false,
        contextError: '',
        hasContextLoaded: false,
        invite: null,
        inviteCodePath: '',
        inviteCodeLoading: false,
        inviteCodeError: ''
      }, () => {
        if (familyId) this.loadInviteContext();
      });
      return;
    }
    if (this.data.isPreview) return;
    const familyId = activeFamilyId();
    const familyChanged = familyId !== this.data.familyId;
    if (familyChanged) {
      inviteContextRequestId += 1;
      inviteCreateRequestId += 1;
      inviteCodeRequestId += 1;
      removeLocalInviteCode(this.data.inviteCodePath);
      this.setData({
        familyId,
        hasActiveFamily: !!familyId,
        canCreateInvite: false,
        canInviteAdmin: false,
        contextLoading: false,
        contextError: '',
        hasContextLoaded: false,
        invite: null,
        inviteCodePath: '',
        inviteCodeLoading: false,
        inviteCodeError: ''
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
    const token = authToken();
    const isCurrentRequest = () => (
      requestId === inviteContextRequestId
      && activeFamilyId() === familyId
      && authToken() === token
    );
    this.setData({
      familyId,
      hasActiveFamily: true,
      contextLoading: true,
      contextError: ''
    });
    try {
      const family = await FamilyService.detail();
      if (!isCurrentRequest()) return;
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
      if (!isCurrentRequest()) return;
      this.setData({
        hasContextLoaded: false,
        contextError: error && error.message ? error.message : '家庭权限暂时无法读取，请重试'
      });
    }
    finally {
      if (requestId === inviteContextRequestId) {
        const tokenUnchanged = authToken() === token;
        this.setData(tokenUnchanged
          ? { contextLoading: false }
          : {
            contextLoading: false,
            canCreateInvite: false,
            canInviteAdmin: false,
            hasContextLoaded: false,
            invite: null,
            inviteCodePath: '',
            inviteCodeLoading: false,
            inviteCodeError: ''
          });
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
    const requestAuthToken = authToken();
    const isCurrentRequest = () => (
      requestId === invitePreviewRequestId
      && this.data.token === token
      && authToken() === requestAuthToken
    );
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await FamilyService.previewInvite(token);
      if (!isCurrentRequest()) return;
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
      if (!isCurrentRequest()) return;
      console.error('获取邀请信息失败:', error);
      if (!wx.getStorageSync('token')) {
        wx.setStorageSync('redirectUrl', `/pages/family/invite/invite?token=${encodeURIComponent(token)}`);
      }
      this.setData({ errorMessage: error && error.message ? error.message : '邀请不存在或已失效' });
    } finally {
      if (requestId === invitePreviewRequestId && this.data.token === token) {
        this.setData(authToken() === requestAuthToken
          ? { loading: false }
          : {
            loading: false,
            preview: null,
            previewFamily: null,
            canAccept: false,
            errorMessage: '登录状态已变化，请重新加载'
          });
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
      inviteContextRequestId += 1;
      inviteCreateRequestId += 1;
      inviteCodeRequestId += 1;
      removeLocalInviteCode(this.data.inviteCodePath);
      this.setData({
        familyId,
        hasActiveFamily: !!familyId,
        hasContextLoaded: false,
        contextLoading: false,
        contextError: '',
        canCreateInvite: false,
        canInviteAdmin: false,
        invite: null,
        inviteCodePath: '',
        inviteCodeLoading: false,
        inviteCodeError: ''
      }, () => {
        if (familyId) this.loadInviteContext();
      });
      return;
    }
    if (this.data.role === 'admin' && !this.data.canInviteAdmin) {
      wx.showToast({ title: '只有家庭主可以邀请管理员', icon: 'none' });
      return;
    }
    if (this.data.creating) return;
    const requestId = ++inviteCreateRequestId;
    const token = authToken();
    const isCurrentRequest = () => (
      requestId === inviteCreateRequestId
      && activeFamilyId() === familyId
      && this.data.familyId === familyId
      && authToken() === token
    );
    this.setData({ creating: true, errorMessage: '' });
    try {
      const invite = await FamilyService.createInvite(this.data.role);
      if (!isCurrentRequest()) {
        if (requestId === inviteCreateRequestId) this.setData({ creating: false });
        return;
      }
      if (activeFamilyId() !== familyId) {
        wx.showToast({ title: '家庭已切换，请重新生成邀请', icon: 'none' });
        return;
      }
      if (!invite || !invite.token) throw new Error('邀请生成失败，请稍后重试');
      inviteCodeRequestId += 1;
      removeLocalInviteCode(this.data.inviteCodePath);
      this.setData({
        invite,
        inviteCodePath: '',
        inviteCodeLoading: false,
        inviteCodeError: ''
      }, () => {
        if (isCurrentRequest() && this.data.invite && this.data.invite.token === invite.token) {
          this.loadInviteCode(invite.token);
        }
      });
      wx.setClipboardData({
        data: invite.token,
        success: () => wx.showToast({ title: '邀请码已复制', icon: 'success', duration: 1400 })
      });
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('生成邀请失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '生成邀请失败', icon: 'none' });
    } finally {
      if (requestId === inviteCreateRequestId) {
        const requestStillCurrent = isCurrentRequest();
        this.setData(requestStillCurrent
          ? { creating: false }
          : {
            creating: false,
            invite: null,
            inviteCodePath: '',
            inviteCodeLoading: false,
            inviteCodeError: ''
          });
      }
    }
  },

  async loadInviteCode(token) {
    if (!token || this.data.inviteCodeLoading) return;
    const requestId = ++inviteCodeRequestId;
    this.setData({ inviteCodeLoading: true, inviteCodeError: '' });
    try {
      const filePath = await downloadInviteCode(token);
      if (requestId !== inviteCodeRequestId || !this.data.invite || this.data.invite.token !== token) {
        removeLocalInviteCode(filePath);
        return;
      }
      this.setData({ inviteCodePath: filePath });
    } catch (error) {
      if (requestId !== inviteCodeRequestId) return;
      console.error('生成小程序码失败:', error);
      this.setData({
        inviteCodeError: error && error.message ? error.message : '小程序码生成失败，请稍后重试'
      });
    } finally {
      if (requestId === inviteCodeRequestId) {
        this.setData({ inviteCodeLoading: false });
      }
    }
  },

  retryInviteCode() {
    const token = this.data.invite && this.data.invite.token;
    if (token) this.loadInviteCode(token);
  },

  saveInviteCode() {
    const filePath = this.data.inviteCodePath;
    if (!filePath) {
      wx.showToast({ title: '小程序码还未准备好', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (error) => {
        const message = String((error && error.errMsg) || '').toLowerCase();
        if (message.includes('auth deny') || message.includes('authorize')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册。',
            confirmText: '去设置',
            success: (result) => {
              if (result.confirm) wx.openSetting();
            }
          });
          return;
        }
        if (!message.includes('cancel')) {
          wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
        }
      }
    });
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
    const token = this.data.token;
    const requestAuthToken = authToken();
    const requestId = ++inviteAcceptRequestId;
    const isCurrentRequest = () => (
      requestId === inviteAcceptRequestId
      && this.data.token === token
      && authToken() === requestAuthToken
    );
    let navigationPending = false;
    this.setData({ accepting: true });
    try {
      const result = await FamilyService.acceptInvite(token);
      if (!isCurrentRequest()) {
        // FamilyService selects the returned family before resolving; never leave
        // that selection attached to a different login session.
        if (authToken() !== requestAuthToken) FamilyService.clearActiveFamilyId();
        return;
      }
      if (!result.family || !result.family.id) throw new Error('加入结果缺少家庭信息');
      FamilyService.setActiveFamilyId(result.family.id);
      wx.showToast({ title: '已加入家庭', icon: 'success', duration: 1200 });
      navigationPending = true;
      setTimeout(() => {
        if (requestId !== inviteAcceptRequestId || authToken() !== requestAuthToken) {
          if (requestId === inviteAcceptRequestId) this.setData({ accepting: false });
          return;
        }
        wx.redirectTo({ url: '/pages/family/index/index' });
        this.setData({ accepting: false });
      }, 500);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('加入家庭失败:', error);
      if (!wx.getStorageSync('token')) {
        wx.setStorageSync('redirectUrl', `/pages/family/invite/invite?token=${encodeURIComponent(this.data.token)}`);
      }
      wx.showToast({ title: error && error.message ? error.message : '加入失败，请稍后重试', icon: 'none' });
    } finally {
      if (requestId === inviteAcceptRequestId) {
        if (isCurrentRequest()) {
          if (!navigationPending) this.setData({ accepting: false });
        } else {
          this.setData({
            accepting: false,
            preview: null,
            previewFamily: null,
            canAccept: false,
            errorMessage: '登录状态已变化，请重新加载'
          });
        }
      }
    }
  },

  openMembers() {
    wx.navigateTo({ url: '/pages/family/members/members' });
  },

  openList() {
    wx.redirectTo({ url: '/pages/family/index/index' });
  },

  onUnload() {
    invitePreviewRequestId += 1;
    inviteContextRequestId += 1;
    inviteCodeRequestId += 1;
    inviteCreateRequestId += 1;
    inviteAcceptRequestId += 1;
    removeLocalInviteCode(this.data.inviteCodePath);
  },

  onShareAppMessage() {
    const token = this.data.token || (this.data.invite && this.data.invite.token) || '';
    const familyName = (this.data.invite && this.data.invite.familyName)
      || (this.data.previewFamily && this.data.previewFamily.name)
      || (this.data.preview && this.data.preview.familyName)
      || '';
    return createFamilyInviteShareContent(token, familyName);
  }
});
