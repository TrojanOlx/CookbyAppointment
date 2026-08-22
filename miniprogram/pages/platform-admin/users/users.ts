import {
  PlatformAdminService,
  PlatformUser,
  PageResult
} from '../../../services/platformAdminService';

interface UserCard extends PlatformUser {
  statusLabel: string;
  createTimeLabel: string;
  initials: string;
}

let usersRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const formatDate = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '时间未知';
  const raw = typeof value === 'number' ? value : String(value);
  const parsed = typeof raw === 'number'
    ? new Date(raw < 100000000000 ? raw * 1000 : raw)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '时间未知';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

const statusLabel = (status: string): string => {
  if (status === 'suspended') return '已停用';
  if (status === 'active') return '正常';
  return status || '未知';
};

const toCard = (user: PlatformUser): UserCard => ({
  ...user,
  statusLabel: statusLabel(user.status),
  createTimeLabel: formatDate(user.createTime),
  initials: (user.nickName || '用').slice(0, 1)
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
      { value: 'suspended', label: '已停用' }
    ],
    users: [] as UserCard[],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  },

  onShow() {
    void this.loadUsers(true);
  },

  onPullDownRefresh() {
    void this.loadUsers(true, true);
  },

  onKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value });
  },

  onKeywordConfirm() {
    this.search();
  },

  search() {
    this.setData({ queryKeyword: String(this.data.keyword || '').trim() });
    void this.loadUsers(true);
  },

  selectStatus(event: WechatMiniprogram.TouchEvent) {
    const status = String(event.currentTarget.dataset.status || '');
    if (status === this.data.status) return;
    this.setData({ status });
    void this.loadUsers(true);
  },

  async loadUsers(reset = false, fromRefresh = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = ++usersRequestId;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      ...(reset ? { loading: true, error: '' } : { loadingMore: true }),
      ...(fromRefresh ? { refreshing: true } : {}),
      ...(reset ? { users: [] } : {})
    });
    try {
      const result: PageResult<PlatformUser> = await PlatformAdminService.getUsers({
        page,
        pageSize: this.data.pageSize,
        keyword: this.data.queryKeyword || undefined,
        status: this.data.status || undefined
      });
      if (requestId !== usersRequestId) return;
      const users = reset ? result.list.map(toCard) : this.data.users.concat(result.list.map(toCard));
      this.setData({
        users,
        page: result.page || page,
        total: result.total,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false,
        error: ''
      });
    } catch (error) {
      if (requestId !== usersRequestId) return;
      this.setData({
        loading: false,
        loadingMore: false,
        error: getErrorMessage(error, '用户列表暂时无法加载')
      });
    } finally {
      if (fromRefresh) {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  onScrollToLower() {
    void this.loadUsers(false);
  },

  retry() {
    void this.loadUsers(true);
  },

  onUserImageError(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const fallbackIndex = Number(event.currentTarget.dataset.index);
    const users = this.data.users as UserCard[];
    const index = id
      ? users.findIndex(user => String(user.id) === id)
      : fallbackIndex;
    if (index < 0 || index >= users.length) return;
    if (!users[index].avatarUrl) return;
    this.setData({ [`users[${index}].avatarUrl`]: '' });
  },

  openUser(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/platform-admin/user-detail/user-detail?id=${encodeURIComponent(id)}` });
  }
});
