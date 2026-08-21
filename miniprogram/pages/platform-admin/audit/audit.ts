import {
  PlatformAdminService,
  PlatformAuditEvent,
  PageResult
} from '../../../services/platformAdminService';

interface AuditCard extends PlatformAuditEvent {
  createTimeLabel: string;
  detailsLabel: string;
  actorLabel: string;
  scopeLabel: string;
}

let auditRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const formatDateTime = (value: number | string): string => {
  if (value === undefined || value === null || value === '') return '时间未知';
  const raw = typeof value === 'number' ? value : String(value);
  const parsed = typeof raw === 'number'
    ? new Date(raw < 100000000000 ? raw * 1000 : raw)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '时间未知';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const detailsLabel = (details: Record<string, unknown> | string | null | undefined): string => {
  if (!details) return '';
  if (typeof details === 'string') return details;
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
};

const toCard = (event: PlatformAuditEvent): AuditCard => ({
  ...event,
  createTimeLabel: formatDateTime(event.createTime),
  detailsLabel: detailsLabel(event.details),
  actorLabel: event.actorName || event.actorId || '系统',
  scopeLabel: event.familyId ? `家庭 ${event.familyId}` : '平台操作'
});

Page({
  data: {
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: '',
    action: '',
    queryAction: '',
    actorId: '',
    queryActorId: '',
    startDate: '',
    queryStartDate: '',
    endDate: '',
    queryEndDate: '',
    actionFilters: [
      { value: '', label: '全部操作' },
      { value: 'platform.user.suspended', label: '停用账号' },
      { value: 'platform.user.restored', label: '恢复账号' },
      { value: 'platform.user.sessions_revoked', label: '撤销会话' }
    ],
    audit: [] as AuditCard[],
    page: 1,
    pageSize: 30,
    total: 0,
    hasMore: false
  },

  onLoad() {
    void this.loadAudit(true);
  },

  onPullDownRefresh() {
    void this.loadAudit(true, true);
  },

  onActionInput(event: WechatMiniprogram.Input) {
    this.setData({ action: event.detail.value });
  },

  onActionConfirm() {
    this.search();
  },

  onActorInput(event: WechatMiniprogram.Input) {
    this.setData({ actorId: event.detail.value });
  },

  onStartDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ startDate: String(event.detail.value || '') });
  },

  onEndDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ endDate: String(event.detail.value || '') });
  },

  search() {
    if (this.data.startDate && this.data.endDate && this.data.startDate > this.data.endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      return;
    }
    this.setData({
      queryAction: String(this.data.action || '').trim(),
      queryActorId: String(this.data.actorId || '').trim(),
      queryStartDate: this.data.startDate,
      queryEndDate: this.data.endDate
    });
    void this.loadAudit(true);
  },

  clearFilters() {
    this.setData({
      action: '',
      queryAction: '',
      actorId: '',
      queryActorId: '',
      startDate: '',
      queryStartDate: '',
      endDate: '',
      queryEndDate: ''
    });
    void this.loadAudit(true);
  },

  selectAction(event: WechatMiniprogram.TouchEvent) {
    const action = String(event.currentTarget.dataset.action || '');
    if (action === this.data.queryAction) return;
    this.setData({ action, queryAction: action });
    void this.loadAudit(true);
  },

  async loadAudit(reset = false, fromRefresh = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = ++auditRequestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      ...(reset ? { loading: true, error: '' } : { loadingMore: true }),
      ...(fromRefresh ? { refreshing: true } : {}),
      ...(reset ? { audit: [] } : {})
    });
    try {
      const result: PageResult<PlatformAuditEvent> = await PlatformAdminService.getAudit({
        page,
        pageSize: this.data.pageSize,
        action: this.data.queryAction || undefined,
        actorId: this.data.queryActorId || undefined,
        startDate: this.data.queryStartDate || undefined,
        endDate: this.data.queryEndDate || undefined
      });
      if (requestId !== auditRequestId) return;
      const audit = reset ? result.list.map(toCard) : this.data.audit.concat(result.list.map(toCard));
      this.setData({
        audit,
        page: result.page || page,
        total: result.total,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false,
        error: ''
      });
    } catch (error) {
      if (requestId !== auditRequestId) return;
      this.setData({ loading: false, loadingMore: false, error: getErrorMessage(error, '审计日志暂时无法加载') });
    } finally {
      if (fromRefresh) {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  onScrollToLower() {
    void this.loadAudit(false);
  },

  retry() {
    void this.loadAudit(true);
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
