// pages/profile/admin/reviews/reviews.ts
import { get, del } from '../../../../services/http';
import { ImageCacheService } from '../../../../utils/imageCache';

let adminReviewsRequestId = 0;

const currentSessionScope = () => {
  const storedFamily = wx.getStorageSync('active_family_id');
  const familyId = storedFamily && typeof storedFamily === 'object'
    ? storedFamily.id || storedFamily.familyId || storedFamily.family_id || ''
    : storedFamily;
  return `${String(wx.getStorageSync('token') || '')}:${String(familyId || '')}`;
};

Page({
  data: {
    reviews: [] as any[],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,
    filterRating: 0,
    expandedId: '' as string
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '评价管理' });
    this.loadReviews(true);
  },

  onPullDownRefresh() {
    this.loadReviews(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadReviews(false);
    }
  },

  async loadReviews(refresh: boolean) {
    if (this.data.loading && !refresh) return;
    const page = refresh ? 1 : this.data.page;
    const requestId = ++adminReviewsRequestId;
    const filterRating = this.data.filterRating;
    const sessionScope = currentSessionScope();
    const isCurrentRequest = () => requestId === adminReviewsRequestId && sessionScope === currentSessionScope();
    this.setData({ loading: true });
    try {
      const params: any = { page, pageSize: this.data.pageSize };
      if (filterRating > 0) params.maxRating = filterRating;
      const res = await get<{ total: number, list: any[] }>('/api/admin/review/list', params);
      const rawList = Array.isArray(res.list) ? res.list : [];
      const list = rawList.map((item: any) => {
        let images: string[] = [];
        if (Array.isArray(item.images)) {
          images = item.images.filter((image: unknown): image is string => typeof image === 'string');
        } else if (typeof item.images === 'string') {
          try {
            const parsed = JSON.parse(item.images);
            images = Array.isArray(parsed)
              ? parsed.filter((image: unknown): image is string => typeof image === 'string')
              : [];
          } catch {
            images = [];
          }
        }
        return {
          ...item,
          dishName: item.dishName || (item.dish && item.dish.name) || '未知菜品',
          dishImage: item.dishImage || item.image || '/images/default-dish.png',
          userName: item.userName || item.nickName || '家庭成员',
          userAvatar: item.userAvatar || item.avatarUrl || '',
          images,
          stars: Array.from({ length: 5 }, (_: any, i: number) => i < Number(item.rating || 0)),
          createTimeStr: item.createTime
            ? new Date(item.createTime).toLocaleDateString('zh-CN') : ''
        };
      });
      const cachedDishList = await ImageCacheService.withCachedImages(
        list,
        item => item.dishImage,
        'cachedDishImage'
      );
      const cachedList = await ImageCacheService.withCachedImages(
        cachedDishList,
        item => item.userAvatar,
        'cachedUserAvatar'
      );
      const all = refresh ? cachedList : [...this.data.reviews, ...cachedList];
      const responseTotal = Number(res.total || 0);
      if (!isCurrentRequest()) return;
      this.setData({
        reviews: all,
        page: page + 1,
        total: responseTotal,
        hasMore: page * this.data.pageSize < responseTotal
      });
    } catch (e) {
      if (isCurrentRequest() && refresh) this.setData({ reviews: [] });
    } finally {
      if (isCurrentRequest()) {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  onUnload() {
    adminReviewsRequestId += 1;
  },

  selectFilter(e: WechatMiniprogram.TouchEvent) {
    const rating = e.currentTarget.dataset.rating as number;
    const newRating = this.data.filterRating === rating ? 0 : rating;
    this.setData({ filterRating: newRating }, () => this.loadReviews(true));
  },

  toggleExpand(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  previewImage(e: WechatMiniprogram.TouchEvent) {
    const { url, images } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: images });
  },

  async deleteReview(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '确认删除该评价？此操作不可恢复。',
        success: res => resolve(res.confirm)
      });
    });
    if (!confirmed) return;
    try {
      await del('/api/review/delete', { id });
      this.setData({ reviews: this.data.reviews.filter((r: any) => r.id !== id) });
      wx.showToast({ title: '删除成功', icon: 'success' });
    } catch {
      wx.showToast({ title: '删除失败', icon: 'error' });
    }
  }
})
