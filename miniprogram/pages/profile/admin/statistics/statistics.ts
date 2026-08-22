// pages/profile/admin/statistics/statistics.ts
import { get } from '../../../../services/http';
import { ImageCacheService } from '../../../../utils/imageCache';

type AppointmentStatusKey = 'pending' | 'confirmed' | 'completed' | 'cancelled';

const STATUS_ALIASES: Record<string, AppointmentStatusKey> = {
  '待确认': 'pending', pending: 'pending',
  '已确认': 'confirmed', confirmed: 'confirmed',
  '已完成': 'completed', completed: 'completed',
  '已取消': 'cancelled', cancelled: 'cancelled'
};

let statisticsRequestId = 0;

const currentSessionScope = () => {
  const storedFamily = wx.getStorageSync('active_family_id');
  const familyId = storedFamily && typeof storedFamily === 'object'
    ? storedFamily.id || storedFamily.familyId || storedFamily.family_id || ''
    : storedFamily;
  return `${String(wx.getStorageSync('token') || '')}:${String(familyId || '')}`;
};

function normalizeStatus(value: unknown): AppointmentStatusKey | null {
  return STATUS_ALIASES[String(value || '').trim().toLowerCase()] || null;
}

Page({
  data: {
    loading: false,
    rangeTab: 7 as number,
    summary: { total: 0, completed: 0, cancelled: 0, pending: 0, confirmed: 0 },
    reviewTotal: 0,
    reviewAverage: '0.0',
    inventoryTotal: 0,
    mealDistribution: {} as Record<string, number>,
    mealPieItems: [] as any[],
    topDishes: [] as any[],
    userRanking: [] as any[],
    maxDishCount: 1,
    maxUserCount: 1,
    dailyLabels: [] as string[],
    dailyValues: [] as number[],
    maxDailyValue: 1
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '预约统计' });
    this.loadStatistics();
  },

  onPullDownRefresh() {
    this.loadStatistics();
  },

  switchRange(e: WechatMiniprogram.TouchEvent) {
    const days = e.currentTarget.dataset.days as number;
    if (days === this.data.rangeTab) return;
    this.setData({ rangeTab: days }, () => this.loadStatistics(days));
  },

  async loadStatistics(rangeTab?: number) {
    const requestId = ++statisticsRequestId;
    const requestedRange = rangeTab === undefined ? this.data.rangeTab : rangeTab;
    const sessionScope = currentSessionScope();
    const isCurrentRequest = () => requestId === statisticsRequestId && sessionScope === currentSessionScope();
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const now = new Date();
      const endDate = now.toISOString().slice(0, 10);
      const startDate = new Date(now.getTime() - (requestedRange - 1) * 86400000)
        .toISOString().slice(0, 10);
      const res = await get<any>('/api/admin/statistics', { startDate, endDate });

      const appointments = res && res.appointments && typeof res.appointments === 'object'
        ? res.appointments : {};
      const reviews = res && res.reviews && typeof res.reviews === 'object' ? res.reviews : {};
      const inventory = res && res.inventory && typeof res.inventory === 'object' ? res.inventory : {};
      const statusCounts: Record<AppointmentStatusKey, number> = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0
      };
      const statusRows = Array.isArray(appointments.byStatus) ? appointments.byStatus : [];
      statusRows.forEach((row: any) => {
        const key = normalizeStatus(row && row.status);
        if (key) statusCounts[key] += Number(row.count || 0);
      });
      const totalAppointments = Number(appointments.total || Object.values(statusCounts).reduce((sum, count) => sum + count, 0));
      const summary = {
        total: totalAppointments,
        pending: statusCounts.pending,
        confirmed: statusCounts.confirmed,
        completed: statusCounts.completed,
        cancelled: statusCounts.cancelled
      };

      // V2 exposes status distribution rather than meal/daily breakdowns.
      // Keep the existing visualization slots populated with the supported data.
      const statusLabels: Record<AppointmentStatusKey, string> = {
        pending: '待确认',
        confirmed: '已确认',
        completed: '已完成',
        cancelled: '已取消'
      };
      const statusColors: Record<AppointmentStatusKey, string> = {
        pending: '#FB8C00',
        confirmed: '#2196F3',
        completed: '#4CAF50',
        cancelled: '#E53935'
      };
      const mealPieItems = (Object.keys(statusLabels) as AppointmentStatusKey[])
        .filter(key => statusCounts[key] > 0)
        .map(key => ({
          label: statusLabels[key],
          count: statusCounts[key],
          pct: totalAppointments ? Math.round(statusCounts[key] / totalAppointments * 100) : 0,
          color: statusColors[key]
        }));

      const popularDishes = Array.isArray(res && res.popularDishes) ? res.popularDishes : [];
      const maxPopularCount = Math.max(
        ...popularDishes.map((dish: any) => Number(dish && dish.count || 0)),
        1
      );
      const topDishesWithPct = popularDishes.map((dish: any, index: number) => ({
        ...dish,
        dishId: dish.dishId || dish.id,
        imageCacheKey: String(dish.dishId || dish.id || index),
        count: Number(dish.count || 0),
        pct: Math.round(Number(dish.count || 0) / maxPopularCount * 100)
      }));
      const topDishes = topDishesWithPct.map((item: any) => ({
        ...item,
        cachedImage: item.image || (Array.isArray(item.images) ? item.images[0] : undefined) || '/images/default-dish.jpg'
      }));

      const maxDishCount = maxPopularCount;
      const userRanking: any[] = [];
      const maxUserCount = 1;
      const mealDist = statusRows.reduce((result: Record<string, number>, row: any) => {
        const key = normalizeStatus(row && row.status);
        if (key) result[statusLabels[key]] = statusCounts[key];
        return result;
      }, {});
      const dailyLabels: string[] = [];
      const dailyValues: number[] = [];
      const maxDailyValue = 1;

      if (!isCurrentRequest()) return;
      this.setData({
        summary,
        reviewTotal: Number(reviews.total || 0),
        reviewAverage: Number(reviews.averageRating || 0).toFixed(1),
        inventoryTotal: Number(inventory.total || 0),
        mealDistribution: mealDist,
        mealPieItems,
        topDishes,
        userRanking,
        maxDishCount,
        maxUserCount,
        dailyLabels,
        dailyValues,
        maxDailyValue
      }, () => {
        wx.nextTick(() => { this.drawBarChart(); });
      });

      void ImageCacheService.withCachedImages(
        topDishesWithPct,
        (item: any) => item.image || (Array.isArray(item.images) ? item.images[0] : undefined),
        'cachedImage',
        {
          onResolved: (updates) => {
            if (!isCurrentRequest()) return;
            updates.forEach(update => {
              const source = topDishesWithPct[update.index];
              if (!source) return;
              const sourceId = String(source.imageCacheKey);
              const currentIndex = (this.data.topDishes as any[]).findIndex(item =>
                String(item.imageCacheKey || item.dishId || item.id || '') === sourceId
              );
              if (currentIndex < 0) return;
              this.setData({ [`topDishes[${currentIndex}].${update.field}`]: update.value });
            });
          }
        }
      );
    } catch (e) {
      if (isCurrentRequest()) wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      if (isCurrentRequest()) {
        this.setData({ loading: false });
        wx.hideLoading();
        wx.stopPullDownRefresh();
      }
    }
  },

  onUnload() {
    statisticsRequestId += 1;
  },

  onTopDishImageError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const dishes = this.data.topDishes as any[];
    const index = id
      ? dishes.findIndex(item => String(item.dishId || item.id || '') === id)
      : fallbackIndex;
    if (index < 0 || index >= dishes.length) return;
    if (dishes[index].cachedImage === '/images/default-dish.jpg') return;
    this.setData({ [`topDishes[${index}].cachedImage`]: '/images/default-dish.jpg' });
  },

  onUserAvatarError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const users = this.data.userRanking as any[];
    const index = id
      ? users.findIndex(item => String(item.userId || item.id || '') === id)
      : fallbackIndex;
    if (index < 0 || index >= users.length) return;
    if (users[index].cachedAvatar === '/images/default-dish.jpg') return;
    this.setData({ [`userRanking[${index}].cachedAvatar`]: '/images/default-dish.jpg' });
  },

  drawBarChart() {
    const { dailyLabels, dailyValues, maxDailyValue } = this.data;
    if (!dailyValues.length) return;

    const query = wx.createSelectorQuery();
    query.select('#barCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const W = res[0].width * dpr;
      const H = res[0].height * dpr;
      canvas.width = W;
      canvas.height = H;
      ctx.scale(dpr, dpr);
      const w = res[0].width;
      const h = res[0].height;

      ctx.clearRect(0, 0, w, h);
      const paddingL = 30;
      const paddingB = 28;
      const paddingT = 10;
      const chartW = w - paddingL - 8;
      const chartH = h - paddingB - paddingT;
      const barCount = dailyValues.length;
      const barW = Math.max(4, Math.floor(chartW / barCount * 0.6));
      const gap = chartW / barCount;

      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = paddingT + chartH - (chartH * i / 4);
        ctx.beginPath();
        ctx.moveTo(paddingL, y);
        ctx.lineTo(w - 8, y);
        ctx.stroke();
        ctx.fillStyle = '#bbb';
        ctx.font = '9px sans-serif';
        ctx.fillText(String(Math.round(maxDailyValue * i / 4)), 0, y + 3);
      }

      dailyValues.forEach((val, i) => {
        const barH = val > 0 ? Math.max(2, Math.floor(chartH * val / maxDailyValue)) : 0;
        const x = paddingL + i * gap + (gap - barW) / 2;
        const y = paddingT + chartH - barH;
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, '#66BB6A');
        grad.addColorStop(1, '#43A047');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barW, barH, 2) : ctx.rect(x, y, barW, barH);
        ctx.fill();
      });

      const step = Math.max(1, Math.ceil(barCount / 7));
      ctx.fillStyle = '#999';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      dailyLabels.forEach((label, i) => {
        if (i % step === 0) {
          const x = paddingL + i * gap + gap / 2;
          ctx.fillText(label, x, h - 4);
        }
      });
    });
  }
})
