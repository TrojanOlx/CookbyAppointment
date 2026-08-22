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
          dishImage: item.dishImage || item.image || '/images/default-dish.jpg',
          userName: item.userName || item.nickName || '家庭成员',
          userAvatar: item.userAvatar || item.avatarUrl || '',
          images,
          stars: Array.from({ length: 5 }, (_: any, i: number) => i < Number(item.rating || 0)),
          createTimeStr: item.createTime
            ? new Date(item.createTime).toLocaleDateString('zh-CN') : ''
        };
      });
      const listWithKeys = list.map((item: any, index: number) => ({
        ...item,
        imageCacheKey: String(item.id || item.reviewId || `${page}:${index}`),
        cachedDishImage: item.dishImage || '/images/default-dish.jpg',
        cachedUserAvatar: item.userAvatar || '/images/default-dish.jpg'
      }));
      const all = refresh ? listWithKeys : [...this.data.reviews, ...listWithKeys];
      const responseTotal = Number(res.total || 0);
      if (!isCurrentRequest()) return;
      this.setData({
        reviews: all,
        page: page + 1,
        total: responseTotal,
        hasMore: page * this.data.pageSize < responseTotal
      });

      const applyResolved = (field: 'cachedDishImage' | 'cachedUserAvatar') => (updates: Array<{ index: number; field: string; value: string }>) => {
        if (!isCurrentRequest()) return;
        updates.forEach(update => {
          const source = listWithKeys[update.index];
          if (!source) return;
          const currentIndex = (this.data.reviews as any[]).findIndex(item =>
            String(item.imageCacheKey || item.id || item.reviewId || '') === String(source.imageCacheKey)
          );
          if (currentIndex < 0) return;
          this.setData({ [`reviews[${currentIndex}].${field}`]: update.value });
        });
      };

      void ImageCacheService.withCachedImages(
        listWithKeys,
        item => item.dishImage,
        'cachedDishImage',
        { onResolved: applyResolved('cachedDishImage') }
      );
      void ImageCacheService.withCachedImages(
        listWithKeys,
        item => item.userAvatar,
        'cachedUserAvatar',
        { onResolved: applyResolved('cachedUserAvatar') }
      );
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

  onUserAvatarError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const reviews = this.data.reviews as any[];
    const index = id
      ? reviews.findIndex(item => String(item.id || item.reviewId || '') === id)
      : fallbackIndex;
    if (index < 0 || index >= reviews.length) return;
    if (reviews[index].cachedUserAvatar === '/images/default-dish.jpg') return;
    this.setData({ [`reviews[${index}].cachedUserAvatar`]: '/images/default-dish.jpg' });
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
