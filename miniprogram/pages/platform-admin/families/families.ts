import {
  PlatformAdminService,
  PlatformFamilySummary,
  PageResult
} from '../../../services/platformAdminService';

interface FamilyCard extends PlatformFamilySummary {
  statusLabel: string;
  createTimeLabel: string;
  ownerLabel: string;
}

let familiesRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const formatDate = (value: number | string): string => {
  if (value === undefined || value === null || value === '') return '时间未知';
  const raw = typeof value === 'number' ? value : String(value);
  const parsed = typeof raw === 'number'
    ? new Date(raw < 100000000000 ? raw * 1000 : raw)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '时间未知';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

const toCard = (family: PlatformFamilySummary): FamilyCard => ({
  ...family,
  statusLabel: family.status === 'active' ? '正常' : family.status === 'archived' ? '已归档' : family.status || '未知',
  createTimeLabel: formatDate(family.createTime),
  ownerLabel: family.owner && family.owner.nickName ? family.owner.nickName : '未设置家庭主'
});

Page({
  data: {
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: '',
    keyword: '',
    queryKeyword: '',
    status: '',
    statusFilters: [
      { value: '', label: '全部' },
      { value: 'active', label: '正常' },
      { value: 'dissolved', label: '已解散' }
    ],
    families: [] as FamilyCard[],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  },

  onLoad() {
    void this.loadFamilies(true);
  },

  onPullDownRefresh() {
    void this.loadFamilies(true, true);
  },

  onKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value });
  },

  onKeywordConfirm() {
    this.search();
  },

  search() {
    this.setData({ queryKeyword: String(this.data.keyword || '').trim() });
    void this.loadFamilies(true);
  },

  selectStatus(event: WechatMiniprogram.TouchEvent) {
    const status = String(event.currentTarget.dataset.status || '');
    if (status === this.data.status) return;
    this.setData({ status });
    void this.loadFamilies(true);
  },

  async loadFamilies(reset = false, fromRefresh = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = ++familiesRequestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      ...(reset ? { loading: true, error: '' } : { loadingMore: true }),
      ...(fromRefresh ? { refreshing: true } : {}),
      ...(reset ? { families: [] } : {})
    });
    try {
      const result: PageResult<PlatformFamilySummary> = await PlatformAdminService.getFamilies({
        page,
        pageSize: this.data.pageSize,
        keyword: this.data.queryKeyword || undefined,
        status: this.data.status || undefined
      });
      if (requestId !== familiesRequestId) return;
      const families = reset ? result.list.map(toCard) : this.data.families.concat(result.list.map(toCard));
      this.setData({
        families,
        page: result.page || page,
        total: result.total,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false,
        error: ''
      });
    } catch (error) {
      if (requestId !== familiesRequestId) return;
      this.setData({ loading: false, loadingMore: false, error: getErrorMessage(error, '家庭列表暂时无法加载') });
    } finally {
      if (fromRefresh) {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  onScrollToLower() {
    void this.loadFamilies(false);
  },

  retry() {
    void this.loadFamilies(true);
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
