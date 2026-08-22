import {
  PlatformAdminService,
  PlatformFamilySummary,
  PlatformSessionSummary,
  PlatformUserDetail
} from '../../../services/platformAdminService';

interface DetailView extends PlatformUserDetail {
  statusLabel: string;
  createTimeLabel: string;
  lastActiveLabel: string;
  sessionCountLabel: string;
  canRevoke: boolean;
  canSuspend: boolean;
  blockedReason: string;
  initials: string;
  families: Array<PlatformFamilySummary & { ownerLabel: string; metricsLabel: string }>;
}

let detailRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const formatDateTime = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '暂无记录';
  const raw = typeof value === 'number' ? value : String(value);
  const parsed = typeof raw === 'number'
    ? new Date(raw < 100000000000 ? raw * 1000 : raw)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '暂无记录';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const formatDate = (value: number | string | undefined): string => formatDateTime(value).split(' ')[0];

const statusLabel = (status: string): string => status === 'suspended' ? '已停用' : status === 'active' ? '正常' : (status || '未知');

const toFamilyView = (family: PlatformFamilySummary): PlatformFamilySummary & { ownerLabel: string; metricsLabel: string } => ({
  ...family,
  ownerLabel: family.owner && family.owner.nickName
    ? `家庭主：${family.owner.nickName}`
    : family.role
      ? `当前用户 · ${family.role === 'owner' ? '家庭主' : family.role === 'admin' ? '管理员' : family.role === 'chef' ? '厨师' : '成员'}`
      : '家庭主信息未提供',
  metricsLabel: `成员 ${family.memberCount} · 菜谱 ${family.recipeCount} · 预约 ${family.appointmentCount}`
});

const toDetailView = (detail: PlatformUserDetail, currentUserId: string): DetailView => {
  const isSelf = !!currentUserId && detail.id === currentUserId;
  const isPlatformProtected = isSelf || !!detail.isPlatformAdmin;
  const isSuspendProtected = isPlatformProtected || !!detail.isOwner;
  const blockedReason = isSelf
    ? '不能停用当前登录账号。'
    : detail.isPlatformAdmin
      ? '平台管理员账号不能从这里停用。'
      : detail.isOwner
        ? '该用户仍是活跃家庭的家庭主，请先处理家庭主交接。'
        : '';
  const session: PlatformSessionSummary | null = detail.lastSession;
  return {
    ...detail,
    statusLabel: statusLabel(detail.status),
    createTimeLabel: formatDate(detail.createTime),
    lastActiveLabel: session ? formatDateTime(session.lastActiveAt) : '暂无会话记录',
    sessionCountLabel: session && (session.sessionCount !== undefined || session.deviceCount !== undefined)
      ? `${session.sessionCount || session.deviceCount || 0} 个活跃会话`
      : '会话数量不可见',
    canRevoke: !isPlatformProtected,
    canSuspend: detail.status === 'active' && !isSuspendProtected,
    blockedReason,
    initials: (detail.nickName || '用').slice(0, 1),
    families: detail.families.map(toFamilyView)
  };
};

Page({
  data: {
    userId: '',
    loading: true,
    actionLoading: false,
    error: '',
    reason: '',
    detail: null as DetailView | null
  },

  onLoad(options?: Record<string, string | undefined>) {
    const userId = options && options.id ? decodeURIComponent(options.id) : '';
    this.setData({ userId });
    if (!userId) {
      this.setData({ loading: false, error: '缺少用户 ID，无法打开用户详情。' });
      return;
    }
    void this.loadDetail();
  },

  onReasonInput(event: WechatMiniprogram.Input) {
    this.setData({ reason: event.detail.value });
  },

  async loadDetail() {
    if (!this.data.userId) return;
    const requestId = ++detailRequestId;
    this.setData({ loading: true, error: '' });
    try {
      const detail = await PlatformAdminService.getUserDetail(this.data.userId);
      if (requestId !== detailRequestId) return;
      const info = wx.getStorageSync('userInfo') || {};
      this.setData({ detail: toDetailView(detail, String(info.id || '')), loading: false });
    } catch (error) {
      if (requestId !== detailRequestId) return;
      this.setData({ loading: false, error: getErrorMessage(error, '用户详情暂时无法加载') });
    }
  },

  retry() {
    void this.loadDetail();
  },

  onRevokeSessions() {
    if (!this.data.detail || !this.data.detail.canRevoke || this.data.actionLoading) return;
    wx.showModal({
      title: '撤销全部会话',
      content: '该用户会被立即退出所有设备，之后需要重新登录。是否继续？',
      confirmText: '确认撤销',
      confirmColor: '#e05a5a',
      success: (result) => {
        if (result.confirm) void this.revokeSessions();
      }
    });
  },

  async revokeSessions() {
    this.setData({ actionLoading: true });
    try {
      await PlatformAdminService.revokeSessions(this.data.userId);
      wx.showToast({ title: '已撤销全部会话', icon: 'success' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '撤销会话失败'), icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  onSuspend() {
    const detail = this.data.detail;
    const reason = String(this.data.reason || '').trim();
    if (!detail || !detail.canSuspend || this.data.actionLoading) return;
    if (!reason) {
      wx.showToast({ title: '请先填写停用原因', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '停用账号',
      content: `确认停用“${detail.nickName}”？账号会立即退出所有设备。`,
      confirmText: '确认停用',
      confirmColor: '#e05a5a',
      success: (result) => {
        if (result.confirm) void this.suspendUser(reason);
      }
    });
  },

  async suspendUser(reason: string) {
    this.setData({ actionLoading: true });
    try {
      await PlatformAdminService.suspendUser(this.data.userId, reason);
      wx.showToast({ title: '账号已停用', icon: 'success' });
      this.setData({ reason: '' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '停用账号失败'), icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  onRestore() {
    const detail = this.data.detail;
    if (!detail || detail.status !== 'suspended' || this.data.actionLoading) return;
    wx.showModal({
      title: '恢复账号',
      content: `确认恢复“${detail.nickName}”？恢复后需要用户重新登录。`,
      confirmText: '确认恢复',
      success: (result) => {
        if (result.confirm) void this.restoreUser();
      }
    });
  },

  async restoreUser() {
    this.setData({ actionLoading: true });
    try {
      await PlatformAdminService.restoreUser(this.data.userId);
      wx.showToast({ title: '账号已恢复', icon: 'success' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '恢复账号失败'), icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  }
});
