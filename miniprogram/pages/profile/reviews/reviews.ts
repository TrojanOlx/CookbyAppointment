// pages/profile/reviews/reviews.ts
import { AppointmentService } from '../../../services/appointmentService';
import { BASE_URL } from '../../../services/http';
import { ImageCacheService } from '../../../utils/imageCache';

let reviewsRequestId = 0;

const currentFamilyId = (): string => {
  const storedFamily = wx.getStorageSync('active_family_id');
  if (storedFamily && typeof storedFamily === 'object') {
    return String(storedFamily.id || storedFamily.familyId || storedFamily.family_id || '');
  }
  return String(storedFamily || '');
};

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
    (this as any)._reviewsFamilyId = currentFamilyId();
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
    const familyId = currentFamilyId();
    if (this.data.loading) {
      if (refresh && (
        (this as any)._reviewsToken !== currentToken
        || (this as any)._reviewsFamilyId !== familyId
      )) {
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
    (this as any)._reviewsFamilyId = familyId;
    const isCurrentRequest = () => (
      requestId === reviewsRequestId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === currentFamilyId()
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
      if (!isCurrentRequest()) return;
      const listWithKeys = list.map((item: any, index: number) => ({
        ...item,
        imageCacheKey: String(item.id || item.reviewId || `${page}:${index}`)
      }));
      const displayList = listWithKeys.map((item: any) => ({
        ...item,
        cachedDishImage: item.dishImage || '/images/default-dish.jpg'
      }));
      const allReviews = refresh ? displayList : [...this.data.reviews, ...displayList];
      this.setData({
        reviews: allReviews,
        page: page + 1,
        total: res.total,
        hasMore: allReviews.length < res.total
      });

      void ImageCacheService.withCachedImages(
        listWithKeys,
        item => item.dishImage,
        'cachedDishImage',
        {
          onResolved: (updates) => {
            if (!isCurrentRequest()) return;
            updates.forEach(update => {
              const source = listWithKeys[update.index] as any;
              if (!source) return;
              const sourceId = String(source.imageCacheKey);
              const currentIndex = (this.data.reviews as any[]).findIndex(item =>
                String(item.imageCacheKey || item.id || item.reviewId || '') === sourceId
              );
              if (currentIndex < 0) return;
              this.setData({ [`reviews[${currentIndex}].${update.field}`]: update.value });
            });
          }
        }
      );
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
  },

  onDishImageError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const reviews = this.data.reviews as any[];
    const index = id
      ? reviews.findIndex(item => String(item.id || item.reviewId || '') === id)
      : fallbackIndex;
    if (index < 0 || index >= reviews.length) return;
    if (reviews[index].cachedDishImage === '/images/default-dish.jpg') return;
    this.setData({ [`reviews[${index}].cachedDishImage`]: '/images/default-dish.jpg' });
  },

  onReviewImageError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.reviewId || '');
    const fallbackIndex = Number(e.currentTarget.dataset.reviewIndex);
    const imageIndex = Number(e.currentTarget.dataset.imageIndex);
    const reviews = this.data.reviews as any[];
    const index = id
      ? reviews.findIndex(item => String(item.id || item.reviewId || '') === id)
      : fallbackIndex;
    if (index < 0 || index >= reviews.length || imageIndex < 0) return;
    const images = Array.isArray(reviews[index].images) ? [...reviews[index].images] : [];
    if (imageIndex >= images.length || images[imageIndex] === '/images/default-dish.jpg') return;
    images[imageIndex] = '/images/default-dish.jpg';
    this.setData({ [`reviews[${index}].images`]: images });
  }
})
