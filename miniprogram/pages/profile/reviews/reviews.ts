// pages/profile/reviews/reviews.ts
import { AppointmentService } from '../../../services/appointmentService';
import { BASE_URL } from '../../../services/http';
import { ImageCacheService } from '../../../utils/imageCache';

let reviewsRequestId = 0;

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
    (this as any)._reviewsToken = String(wx.getStorageSync('token') || '');
    wx.setNavigationBarTitle({ title: '我的评价' });
    this.loadReviews(true);
  },

  onUnload() {
    reviewsRequestId += 1;
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
    const currentToken = String(wx.getStorageSync('token') || '');
    if (this.data.loading) {
      if (refresh && (this as any)._reviewsToken !== currentToken) {
        reviewsRequestId += 1;
        this.setData({ reviews: [], page: 1, total: 0, hasMore: true, loading: false, refreshing: false });
      } else {
        if (refresh) wx.stopPullDownRefresh();
        return;
      }
    }
    const page = refresh ? 1 : this.data.page;
    const requestId = ++reviewsRequestId;
    const token = currentToken;
    (this as any)._reviewsToken = token;
    const isCurrentRequest = () => (
      requestId === reviewsRequestId
      && token === String(wx.getStorageSync('token') || '')
    );
    this.setData({ loading: true, refreshing: refresh });
    try {
      const res = await AppointmentService.getUserReviews(page, this.data.pageSize);
      if (!isCurrentRequest()) return;
      const raw = res.list || [];
      const list = raw.map((item: any) => {
        let images: string[] = [];
        try {
          images = typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || []);
        } catch { images = []; }
        images = images.map((img: string) =>
          img.startsWith('http') ? img : `${BASE_URL}/${img}`
        ).filter(Boolean);
        const nestedDishImages = (item.dish && Array.isArray(item.dish.images)) ? item.dish.images : [];
        const rawDishImage = item.dishImage || nestedDishImages[0] || '';
        const dishImage = rawDishImage
          ? (rawDishImage.startsWith('http') ? rawDishImage : `${BASE_URL}/${rawDishImage.replace(/^\/+/, '')}`)
          : '/images/default-dish.jpg';
        const stars = Array.from({ length: 5 }, (_, i) => i < item.rating);
        const createTimeStr = item.createTime
          ? new Date(item.createTime).toLocaleDateString('zh-CN')
          : '';
        return {
          ...item,
          images,
          dishName: item.dishName || (item.dish && item.dish.name) || '未知菜品',
          dishImage,
          stars,
          createTimeStr
        };
      });
      const cachedList = await ImageCacheService.withCachedImages(
        list,
        item => item.dishImage,
        'cachedDishImage'
      );
      if (!isCurrentRequest()) return;
      const allReviews = refresh ? cachedList : [...this.data.reviews, ...cachedList];
      this.setData({
        reviews: allReviews,
        page: page + 1,
        total: res.total,
        hasMore: allReviews.length < res.total
      });
    } catch (e) {
      if (isCurrentRequest() && refresh) this.setData({ reviews: [] });
    } finally {
      if (requestId === reviewsRequestId) {
        this.setData({ loading: false, refreshing: false });
        wx.stopPullDownRefresh();
      }
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
