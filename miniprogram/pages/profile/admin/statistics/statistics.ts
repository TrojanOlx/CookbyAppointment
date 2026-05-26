// pages/profile/admin/statistics/statistics.ts
import { get } from '../../../../services/http';

Page({
  data: {
    loading: false,
    rangeTab: 7 as number,
    summary: { total: 0, completed: 0, cancelled: 0, pending: 0, confirmed: 0 },
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
    this.setData({ rangeTab: days });
    this.loadStatistics();
  },

  async loadStatistics() {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const now = new Date();
      const endDate = now.toISOString().slice(0, 10);
      const startDate = new Date(now.getTime() - (this.data.rangeTab - 1) * 86400000)
        .toISOString().slice(0, 10);
      const res = await get<any>('/api/admin/statistics', { startDate, endDate });

      const topDishes = (res.topDishes || []).map((d: any) => ({
        ...d,
        pct: res.topDishes[0] ? Math.round(d.count / res.topDishes[0].count * 100) : 0
      }));
      const maxDishCount = res.topDishes && res.topDishes[0] ? res.topDishes[0].count : 1;

      const userRanking = (res.userRanking || []).map((u: any) => ({
        ...u,
        pct: res.userRanking[0] ? Math.round(u.count / res.userRanking[0].count * 100) : 0
      }));
      const maxUserCount = res.userRanking && res.userRanking[0] ? res.userRanking[0].count : 1;

      const mealColors: Record<string, string> = {
        '早餐': '#FF9800', '午餐': '#4CAF50', '晚餐': '#2196F3'
      };
      const mealDist = res.mealDistribution || {};
      const mealTotal = Object.values(mealDist).reduce((a: number, b: any) => a + Number(b), 0) || 1;
      const mealPieItems = Object.entries(mealDist).map(([label, count]) => ({
        label,
        count,
        pct: Math.round(Number(count) / mealTotal * 100),
        color: mealColors[label] || '#9E9E9E'
      }));

      const dailyTrend: { date: string, count: number }[] = res.dailyTrend || [];
      const dailyLabels = dailyTrend.map(d => d.date.slice(5));
      const dailyValues = dailyTrend.map(d => d.count);
      const maxDailyValue = Math.max(...dailyValues, 1);

      this.setData({
        summary: res.summary || {},
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
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
      wx.stopPullDownRefresh();
    }
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