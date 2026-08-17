// pages/profile/admin/reviews/reviews.ts
import { get, del } from '../../../../services/http';
import { ImageCacheService } from '../../../../utils/imageCache';

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
      this.setData({
        reviews: all,
        page: page + 1,
        total: responseTotal,
        hasMore: page * this.data.pageSize < responseTotal
      });
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
