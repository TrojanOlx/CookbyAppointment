// pages/profile/reviews/reviews.ts
import { AppointmentService } from '../../../services/appointmentService';
import { BASE_URL } from '../../../services/http';

Page({
  data: {
    reviews: [] as any[],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loading: false,
    refreshing: false,
    expandedId: '' as string
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '我的评价' });
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
      const res = await AppointmentService.getUserReviews(page, this.data.pageSize);
      const raw = res.list || [];
      const list = raw.map((item: any) => {
        let images: string[] = [];
        try {
          images = typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || []);
        } catch { images = []; }
        images = images.map((img: string) =>
          img.startsWith('http') ? img : `${BASE_URL}/${img}`
        ).filter(Boolean);
        const dishImages = ((item.dish && item.dish.images) || []).map((img: string) =>
          img.startsWith('http') ? img : `${BASE_URL}/${img}`
        );
        const stars = Array.from({ length: 5 }, (_, i) => i < item.rating);
        const createTimeStr = item.createTime
          ? new Date(item.createTime).toLocaleDateString('zh-CN')
          : '';
        return {
          ...item,
          images,
          dishName: item.dish ? item.dish.name : '未知菜品',
          dishImage: dishImages[0] || '/images/default-dish.png',
          stars,
          createTimeStr
        };
      });
      const allReviews = refresh ? list : [...this.data.reviews, ...list];
      this.setData({
        reviews: allReviews,
        page: page + 1,
        total: res.total,
        hasMore: allReviews.length < res.total
      });
    } catch (e) {
      if (refresh) this.setData({ reviews: [] });
    } finally {
      this.setData({ loading: false, refreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  toggleExpand(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  previewImage(e: WechatMiniprogram.TouchEvent) {
    const { url, images } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: images });
  }
})