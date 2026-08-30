import {
  AchievementProgress,
  AchievementSummary,
  DishAtlasItem
} from '../../../models/achievement';
import { AchievementService } from '../../../services/achievementService';

type AchievementTab = 'badges' | 'atlas';

let badgeRequestId = 0;
let atlasRequestId = 0;
let pinRequestId = 0;
let achievementPageGeneration = 0;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const currentSessionToken = (): string => String(wx.getStorageSync('token') || '');

const isSameSession = (token: string, generation: number): boolean => (
  generation === achievementPageGeneration && token === currentSessionToken()
);

const progressPercent = (unlocked: number, total: number): number => (
  total > 0 ? Math.max(0, Math.min(100, Math.round(unlocked / total * 100))) : 0
);

const withPinnedState = (
  badges: AchievementProgress[],
  pinnedAchievementId: string | null
): AchievementProgress[] => badges.map(item => ({
  ...item,
  pinned: Boolean(
    pinnedAchievementId
    && (String(item.id) === String(pinnedAchievementId) || item.key === pinnedAchievementId)
  )
}));

Page({
  data: {
    activeTab: 'badges' as AchievementTab,
    badges: [] as AchievementProgress[],
    atlas: [] as DishAtlasItem[],
    unlockedCount: 0,
    totalCount: 12,
    unlockPercent: 0,
    pinnedAchievementId: null as string | null,
    pinnedAchievement: null as AchievementProgress | null,
    badgeLoading: false,
    atlasLoading: false,
    badgeError: '',
    atlasError: '',
    atlasLoaded: false,
    pinningId: '',
    refreshing: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '我的成就' });
    this.loadBadges(true);
  },

  onShow() {
    // Profile can navigate back here after a new meal is recorded. Refresh
    // once per show while keeping the currently selected tab intact.
    if ((this as any)._hasLoaded) this.loadBadges(true);
    (this as any)._hasLoaded = true;
  },

  onUnload() {
    achievementPageGeneration += 1;
    badgeRequestId += 1;
    atlasRequestId += 1;
    pinRequestId += 1;
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadBadges(true);
    if (this.data.atlasLoaded || this.data.activeTab === 'atlas') this.loadAtlas(true);
  },

  switchTab(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || '') as AchievementTab;
    if (tab !== 'badges' && tab !== 'atlas') return;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'atlas' && !this.data.atlasLoaded && !this.data.atlasLoading) {
      this.loadAtlas(true);
    }
  },

  async loadBadges(force = false) {
    if (this.data.badgeLoading && !force) return;
    const requestId = ++badgeRequestId;
    const pageGeneration = achievementPageGeneration;
    const token = currentSessionToken();
    this.setData({ badgeLoading: true, badgeError: '' });
    try {
      const [summary, listResponse] = await Promise.all([
        AchievementService.getSummary(),
        AchievementService.getList()
      ]);
      if (!isSameSession(token, pageGeneration) || requestId !== badgeRequestId) return;
      const mergedSummary: AchievementSummary = {
        ...summary,
        achievements: listResponse.list,
        total: Math.max(summary.total, listResponse.total),
        totalCount: Math.max(summary.totalCount, listResponse.total),
        unlocked: Math.max(summary.unlocked, listResponse.list.filter(item => item.unlocked).length),
        unlockedCount: Math.max(summary.unlockedCount, listResponse.list.filter(item => item.unlocked).length)
      };
      this.applySummary(mergedSummary);
      this.announceNewUnlocks(mergedSummary);
    } catch (error) {
      if (!isSameSession(token, pageGeneration) || requestId !== badgeRequestId) return;
      this.setData({ badgeError: getErrorMessage(error, '成就暂时无法加载，请稍后重试') });
    } finally {
      if (isSameSession(token, pageGeneration) && requestId === badgeRequestId) {
        this.setData({ badgeLoading: false, refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  applySummary(summary: AchievementSummary) {
    const pinnedAchievementId = summary.pinnedAchievementId || null;
    const badges = withPinnedState(summary.achievements, pinnedAchievementId);
    const pinnedAchievement = badges.find(item => item.pinned) || null;
    const totalCount = Math.max(12, Number(summary.totalCount || summary.total || badges.length));
    const unlockedCount = Math.max(0, Number(summary.unlockedCount || summary.unlocked || 0));
    this.setData({
      badges,
      totalCount,
      unlockedCount,
      unlockPercent: progressPercent(unlockedCount, totalCount),
      pinnedAchievementId,
      pinnedAchievement,
      badgeError: ''
    });
  },

  announceNewUnlocks(summary: AchievementSummary) {
    const candidates = summary.unacknowledged.length > 0
      ? summary.unacknowledged
      : summary.newlyUnlockedIds
        .map(id => summary.achievements.find(item => String(item.id) === String(id) || item.key === id))
        .filter((item): item is AchievementProgress => Boolean(item));
    const announced = ((this as any)._announcedUnlocks || new Set<string>()) as Set<string>;
    const fresh = candidates.filter(item => item.unlocked && !announced.has(String(item.id)));
    if (!fresh.length) return;
    fresh.forEach(item => announced.add(String(item.id)));
    (this as any)._announcedUnlocks = announced;
    wx.showToast({
      title: fresh.length === 1 ? `解锁「${fresh[0].name}」` : `解锁 ${fresh.length} 枚成就`,
      icon: 'success',
      duration: 1800
    });
    void AchievementService.ackUnlocks(fresh.map(item => item.id)).catch(error => {
      console.warn('确认成就提醒失败:', error);
    });
  },

  async loadAtlas(force = false) {
    if (this.data.atlasLoading && !force) return;
    const requestId = ++atlasRequestId;
    const pageGeneration = achievementPageGeneration;
    const token = currentSessionToken();
    this.setData({ atlasLoading: true, atlasError: '' });
    try {
      const result = await AchievementService.getAtlas();
      if (!isSameSession(token, pageGeneration) || requestId !== atlasRequestId) return;
      this.setData({
        atlas: result.list,
        atlasLoaded: true,
        atlasError: ''
      });
    } catch (error) {
      if (!isSameSession(token, pageGeneration) || requestId !== atlasRequestId) return;
      this.setData({ atlasError: getErrorMessage(error, '菜品图鉴暂时无法加载，请稍后重试') });
    } finally {
      if (isSameSession(token, pageGeneration) && requestId === atlasRequestId) {
        this.setData({ atlasLoading: false, refreshing: false });
        wx.stopPullDownRefresh();
      }
    }
  },

  retry() {
    if (this.data.activeTab === 'atlas') this.loadAtlas(true);
    else this.loadBadges(true);
  },

  async togglePin(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id || this.data.pinningId) return;
    const badge = (this.data.badges as AchievementProgress[]).find(item => String(item.id) === id);
    if (!badge) return;
    if (!badge.unlocked) {
      wx.showToast({ title: '解锁后才能佩戴', icon: 'none' });
      return;
    }

    const nextId = this.data.pinnedAchievementId === id ? null : id;
    const requestId = ++pinRequestId;
    const pageGeneration = achievementPageGeneration;
    const token = currentSessionToken();
    this.setData({ pinningId: id });
    try {
      const result = await AchievementService.pin(nextId);
      if (!isSameSession(token, pageGeneration) || requestId !== pinRequestId) return;
      const returned = result && result.pinnedAchievementId !== undefined
        ? result.pinnedAchievementId
        : nextId;
      const pinnedAchievementId = returned ? String(returned) : null;
      const badges = withPinnedState(this.data.badges as AchievementProgress[], pinnedAchievementId);
      this.setData({
        badges,
        pinnedAchievementId,
        pinnedAchievement: badges.find(item => item.pinned) || null,
        pinningId: ''
      });
      wx.showToast({ title: pinnedAchievementId ? '徽章已佩戴' : '已取消佩戴', icon: 'success', duration: 1200 });
    } catch (error) {
      if (!isSameSession(token, pageGeneration) || requestId !== pinRequestId) return;
      this.setData({ pinningId: '' });
      wx.showToast({ title: getErrorMessage(error, '佩戴失败，请稍后重试'), icon: 'none' });
    }
  },

  openAtlasItem(event: WechatMiniprogram.TouchEvent) {
    const item = event.currentTarget.dataset.item as DishAtlasItem | undefined;
    const name = String(event.currentTarget.dataset.name || item?.name || '');
    const scopeId = String(event.currentTarget.dataset.scopeId || item?.scopeId || '');
    const normalizedName = String(event.currentTarget.dataset.normalizedName || item?.normalizedName || name);
    const query = [
      `dishName=${encodeURIComponent(name)}`,
      `normalizedName=${encodeURIComponent(normalizedName)}`,
      `scopeId=${encodeURIComponent(scopeId)}`
    ].join('&');
    wx.navigateTo({ url: `/pages/profile/history/index?${query}` });
  },

  onAtlasImageError(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.atlas.length) return;
    if (this.data.atlas[index].imageUrl === '/images/default-dish.jpg') return;
    this.setData({ [`atlas[${index}].imageUrl`]: '/images/default-dish.jpg' });
  }
});
