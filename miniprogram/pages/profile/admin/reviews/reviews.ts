// pages/profile/admin/reviews/reviews.ts
import { get, del } from '../../../../services/http';

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
    if (this.data.loading) return;
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });
    try {
      const params: any = { page, pageSize: this.data.pageSize };
      if (this.data.filterRating > 0) params.maxRating = this.data.filterRating;
      const res = await get<{ total: number, list: any[] }>('/api/admin/review/list', params);
      const list = (res.list || []).map((item: any) => ({
        ...item,
        stars: Array.from({ length: 5 }, (_: any, i: number) => i < item.rating),
        createTimeStr: item.createTime
          ? new Date(item.createTime).toLocaleDateString('zh-CN') : ''
      }));
      const all = refresh ? list : [...this.data.reviews, ...list];
      this.setData({ reviews: all, page: page + 1, total: res.total, hasMore: all.length < res.total });
    } catch (e) {
      if (refresh) this.setData({ reviews: [] });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  selectFilter(e: WechatMiniprogram.TouchEvent) {
    const rating = e.currentTarget.dataset.rating as number;
    const newRating = this.data.filterRating === rating ? 0 : rating;
    this.setData({ filterRating: newRating });
    this.loadReviews(true);
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