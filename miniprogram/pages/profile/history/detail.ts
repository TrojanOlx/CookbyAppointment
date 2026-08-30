import { BASE_URL } from '../../../services/http';
import { HistoryService, HISTORY_MAX_NOTE_LENGTH, HISTORY_MAX_PHOTOS } from './historyService';
import { ACHIEVEMENT_CATALOG } from '../../../models/achievement';
import {
  MealDishSnapshot,
  MealParticipant,
  MealRecord,
  MemoryContribution,
} from '../../../models/history';

const { FamilyService } = require('../../../services/family');

const DEFAULT_IMAGE = '/images/default-dish.jpg';
const SNAPSHOT_ACHIEVEMENT_KEYS: Record<string, string> = {
  first_meal: 'meal-first',
  ten_meals: 'meal-ten',
  thirty_meals: 'meal-thirty',
  hundred_meals: 'meal-hundred',
  five_dishes: 'dish-five',
  fifteen_dishes: 'dish-fifteen',
  thirty_dishes: 'dish-thirty',
  favorite_return: 'dish-return-five',
  three_meals: 'meal-types-three',
  three_months: 'months-three',
  first_photo: 'photo-first',
  five_notes: 'note-five',
};
let detailRequestId = 0;

type UploadSettlement<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

const settleUploads = <T>(promises: Array<Promise<T>>): Promise<UploadSettlement<T>[]> => {
  const promiseConstructor = Promise as unknown as {
    allSettled?: (values: Array<Promise<T>>) => Promise<UploadSettlement<T>[]>;
  };
  if (promiseConstructor.allSettled) return promiseConstructor.allSettled.call(Promise, promises);
  return Promise.all(promises.map(promise => promise.then(
    value => ({ status: 'fulfilled' as const, value }),
    reason => ({ status: 'rejected' as const, reason }),
  )));
};

interface DetailDish extends MealDishSnapshot {
  displayImage: string;
  displayType: string;
}

interface DetailParticipant extends MealParticipant {
  participantKey: string;
  displayName: string;
  displayAvatar: string;
  displayBadgeIcon: string;
  displayBadgeName: string;
  noteText: string;
  photoUrls: string[];
  canEditContribution: boolean;
  frozenLabel: string;
}

interface DetailRecord extends MealRecord {
  detailDishes: DetailDish[];
  detailParticipants: DetailParticipant[];
  displaySource: string;
  displayFamily: string;
  displayDate: string;
  displaySummary: string;
  displayImage: string;
  repeatIds: string[];
  unavailableNames: string[];
}

const activeFamilyId = (): string => {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') return String(value.id || value.familyId || value.family_id || '');
  return String(value || '');
};

const normalizeFamilyId = (value: unknown): string => String(value || '').trim().replace(/^family:/, '');

const repeatFamilyIdFor = (record: MealRecord): string => {
  const raw = record as MealRecord & Record<string, unknown>;
  return normalizeFamilyId(record.repeatFamilyId || raw.repeat_family_id || record.familyId || raw.family_id);
};

const imageUrl = (value: unknown): string => {
  const source = String(value || '').trim();
  if (!source) return DEFAULT_IMAGE;
  if (/^(https?:|data:|wxfile:)/i.test(source)) return source;
  if (source.startsWith('/images/')) return source;
  if (source.startsWith('/')) return `${BASE_URL}${source}`;
  return `${BASE_URL}/${source}`;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean);
};

const currentUserId = (): string => {
  const stored = wx.getStorageSync('userInfo');
  if (stored && typeof stored === 'object') {
    return String(stored.id || stored.userId || stored.openid || '');
  }
  return String(wx.getStorageSync('userId') || wx.getStorageSync('openid') || '');
};

const sourceLabel = (source: string, fallback?: string): string => {
  if (source === 'automatic') return '预约完成';
  if (source === 'legacy_backfill') return '历史回填';
  if (source === 'manual') return '手动补记';
  return String(fallback || source || '历史记录');
};

const formatDate = (value: string): string => {
  const source = String(value || '').slice(0, 10);
  const match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : source || '未记录日期';
};

const participantContribution = (participant: MealParticipant): MemoryContribution => {
  const nested = participant.contribution;
  if (nested && typeof nested === 'object') return nested;
  return participant as unknown as MemoryContribution;
};

const normalizeParticipant = (participant: MealParticipant): DetailParticipant => {
  const raw = participant as MealParticipant & Record<string, unknown>;
  const contribution = participantContribution(participant);
  const participantKey = String(participant.participantId || participant.id || participant.userId || '');
  const photos = asStringArray(contribution.images || contribution.photos || participant.images || participant.photos);
  const noteText = String(contribution.note || contribution.content || participant.note || participant.content || '').trim();
  const avatar = String(participant.avatarUrl || contribution.avatarUrl || '');
  const rawBadge = raw.wornBadge && typeof raw.wornBadge === 'object' && !Array.isArray(raw.wornBadge)
    ? raw.wornBadge as DetailParticipant['badge']
    : null;
  const badge = participant.badge && typeof participant.badge === 'object' && !Array.isArray(participant.badge)
    ? participant.badge
    : rawBadge;
  const badgeIds = Array.isArray(raw.badgeIds)
    ? raw.badgeIds.map(String)
    : Array.isArray(participant.badge) ? participant.badge.map(String) : [];
  const snapshotBadgeId = String(raw.badgeAchievementId || badgeIds[0] || '');
  const localBadgeKey = SNAPSHOT_ACHIEVEMENT_KEYS[snapshotBadgeId] || snapshotBadgeId;
  const catalogBadge = ACHIEVEMENT_CATALOG.find(item => item.id === localBadgeKey || item.key === localBadgeKey);
  const badgeIcon = String(participant.badgeIconUrl || (badge && (badge.iconUrl || badge.icon)) || catalogBadge?.icon || raw.achievementIconUrl || '');
  const badgeName = String(participant.badgeName || (badge && badge.name) || catalogBadge?.name || '已佩戴徽章');
  const sameUser = !!participant.userId && participant.userId === currentUserId();
  const frozen = participant.frozen === true
    || Boolean(participant.frozenAt)
    || contribution.frozen === true
    || Boolean(contribution.frozenAt);
  const canEditContribution = frozen
    ? false
    : typeof participant.canEdit === 'boolean'
      ? participant.canEdit === true
      : typeof contribution.canEdit === 'boolean'
        ? contribution.canEdit === true
        : (sameUser && participant.hidden !== true && contribution.hidden !== true);
  return {
    ...participant,
    participantKey,
    displayName: String(participant.nickname || participant.nickName || raw.name || raw.userNameSnapshot || contribution.nickname || contribution.nickName || '家庭成员'),
    displayAvatar: avatar ? imageUrl(avatar) : '/images/icons/icon-profile.svg',
    displayBadgeIcon: badgeIcon ? imageUrl(badgeIcon) : '',
    displayBadgeName: badgeName,
    noteText,
    photoUrls: photos.map(imageUrl),
    canEditContribution,
    frozenLabel: frozen ? '已冻结' : '',
  };
};

const normalizeDetail = (record: MealRecord): DetailRecord => {
  const raw = record as MealRecord & Record<string, unknown>;
  const dishes = Array.isArray(record.dishes) ? record.dishes : [];
  const participants = Array.isArray(record.participants) ? record.participants : [];
  const detailDishes = dishes.map(dish => {
    const images = asStringArray(dish.images);
    return {
      ...dish,
      displayImage: imageUrl(dish.image || dish.imageUrl || images[0]),
      displayType: String(dish.type || '家常菜'),
    };
  });
  const detailParticipants = participants.map(normalizeParticipant);
  const images = asStringArray(record.images || record.photos || raw.previewImages);
  const firstParticipantImage = detailParticipants.find(item => item.photoUrls.length)?.photoUrls[0] || '';
  const firstImage = images[0] || record.firstImage || record.imageUrl || firstParticipantImage || detailDishes[0]?.displayImage || DEFAULT_IMAGE;
  const repeatIds = Array.isArray(record.repeatDishIds)
    ? record.repeatDishIds.map(String).filter(Boolean)
    : dishes
      .filter(dish => dish && dish.available !== false && dish.repeatable !== false)
      .map(dish => String(dish.dishId || dish.originalDishId || ''))
      .filter(Boolean);
  const unavailableNames = Array.isArray(record.repeatUnavailableNames)
    ? record.repeatUnavailableNames.map(String).filter(Boolean)
    : dishes
      .filter(dish => dish && (dish.available === false || dish.repeatable === false))
      .map(dish => String(dish.name || '').trim())
      .filter(Boolean);
  const frozen = record.frozen === true || Boolean(record.frozenAt || raw.frozen_at);
  const hasCanExclude = typeof record.canExclude === 'boolean';
  return {
    ...record,
    frozen,
    detailDishes,
    detailParticipants,
    displaySource: sourceLabel(String(record.source || raw.sourceType || ''), record.sourceLabel),
    displayFamily: String(record.familyName || raw.family_name || (record.scope === 'personal' ? '个人回忆' : '当前家庭')),
    displayDate: formatDate(String(record.date || raw.mealDate || raw.recordDate || '')),
    displaySummary: String(record.summary || record.note || detailParticipants.find(item => item.noteText)?.noteText || '').trim(),
    displayImage: imageUrl(firstImage),
    canExclude: hasCanExclude
      ? record.canExclude === true
      : ((record.source === 'automatic' || record.source === 'legacy_backfill') && record.scope === 'personal' && detailParticipants.some(item => item.canEditContribution)),
    repeatIds,
    unavailableNames,
  };
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const getErrorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
};

Page({
  data: {
    recordId: '',
    record: null as DetailRecord | null,
    loading: false,
    refreshing: false,
    error: '',
    actionLoading: false,
    editingParticipantId: '',
    editingNote: '',
    editingImages: [] as string[],
    editingImageRefs: [] as string[],
    uploadingImages: false,
    savingContribution: false,
  },

  onLoad(options?: Record<string, string | undefined>) {
    const id = String(options && (options.id || options.recordId) || '');
    this.setData({ recordId: id });
    wx.setNavigationBarTitle({ title: '回忆详情' });
    if (id) this.loadDetail(id);
    else this.setData({ error: '缺少回忆记录 ID，无法打开详情。' });
  },

  onUnload() {
    detailRequestId += 1;
  },

  onShow() {
    if ((this as any)._detailLoaded && !this.data.editingParticipantId && this.data.recordId) {
      this.loadDetail(this.data.recordId);
    }
  },

  onPullDownRefresh() {
    if (!this.data.recordId) return;
    this.setData({ refreshing: true }, () => this.loadDetail(this.data.recordId));
  },

  async loadDetail(id: string) {
    if (!id) return;
    const requestId = ++detailRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const familyId = activeFamilyId();
    const isCurrentRequest = () => requestId === detailRequestId
      && id === this.data.recordId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === activeFamilyId();
    const restartForContextChange = () => {
      if (requestId !== detailRequestId) return;
      detailRequestId += 1;
      this.setData({ loading: false, refreshing: false }, () => {
        if (this.data.recordId === id) this.loadDetail(id);
      });
    };
    this.setData({ loading: true, error: '' });
    try {
      const record = await HistoryService.getHistoryDetail(id);
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.setData({ record: normalizeDetail(record), loading: false, refreshing: false, error: '' });
      (this as any)._detailLoaded = true;
    } catch (error) {
      if (!isCurrentRequest()) {
        restartForContextChange();
        return;
      }
      this.setData({ loading: false, refreshing: false, error: getErrorMessage(error, '回忆详情暂时无法加载') });
    } finally {
      if (requestId === detailRequestId) wx.stopPullDownRefresh();
    }
  },

  retry() {
    if (this.data.recordId) this.loadDetail(this.data.recordId);
  },

  openEditor() {
    const record = this.data.record as DetailRecord | null;
    if (!record || !record.canEdit || record.frozen === true || Boolean(record.frozenAt)) return;
    wx.navigateTo({ url: `/pages/profile/history/editor?id=${encodeURIComponent(record.id)}` });
  },

  beginContribution(event: WechatMiniprogram.TouchEvent) {
    const participantId = String(event.currentTarget.dataset.participantId || '');
    const record = this.data.record as DetailRecord | null;
    if (!participantId || !record) return;
    const participant = record.detailParticipants.find(item => item.participantKey === participantId);
    if (!participant || !participant.canEditContribution) return;
    const raw = participant as DetailParticipant & Record<string, unknown>;
    const contribution = participantContribution(participant);
    const refs = asStringArray(contribution.imageRefs || contribution.images || contribution.photos || raw.imageRefs);
    this.setData({
      editingParticipantId: participantId,
      editingNote: participant.noteText,
      editingImages: participant.photoUrls.slice(),
      editingImageRefs: refs.slice(),
    });
  },

  cancelContribution() {
    this.setData({ editingParticipantId: '', editingNote: '', editingImages: [], editingImageRefs: [] });
  },

  onContributionInput(event: WechatMiniprogram.Input) {
    this.setData({ editingNote: String(event.detail.value || '').slice(0, HISTORY_MAX_NOTE_LENGTH) });
  },

  async chooseContributionImages() {
    if (this.data.uploadingImages || this.data.savingContribution) return;
    const remaining = HISTORY_MAX_PHOTOS - (this.data.editingImages as string[]).length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传${HISTORY_MAX_PHOTOS}张`, icon: 'none' });
      return;
    }
    const participantId = String(this.data.editingParticipantId || '');
    const recordId = String(this.data.recordId || '');
    if (!participantId || !recordId) return;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: result => {
        const files = (result.tempFiles || []).slice(0, remaining);
        if (!files.length) return;
        this.setData({ uploadingImages: true });
        const rawRecord = this.data.record as (DetailRecord & Record<string, unknown>) | null;
        const familyId = String(rawRecord?.familyId || rawRecord?.family_id || '');
        void settleUploads(files.map(file => HistoryService.uploadMemoryFile(file.tempFilePath, {
          recordId,
          participantId,
          familyId: familyId || undefined,
        })))
          .then(results => {
            const urls: string[] = [];
            const refs: string[] = [];
            let failedCount = 0;
            results.forEach(settled => {
              if (settled.status === 'rejected') {
                failedCount += 1;
                return;
              }
              const result = settled.value;
              const data = result && typeof result.data === 'object' ? result.data : undefined;
              const file = result && typeof result.file === 'object' ? result.file : undefined;
              const url = String(result.url || result.downloadUrl || data?.url || data?.downloadUrl || file?.url || file?.downloadUrl || result.filePath || data?.filePath || file?.filePath || '').trim();
              const ref = String(result.id || result.fileId || data?.id || data?.fileId || file?.id || file?.fileId || url).trim();
              if (url || ref) {
                refs.push(ref || url);
                urls.push(imageUrl(url || `/api/history/file/download?id=${encodeURIComponent(ref)}`));
              } else failedCount += 1;
            });
            if (urls.length) {
              this.setData({
                editingImages: (this.data.editingImages as string[]).concat(urls).slice(0, HISTORY_MAX_PHOTOS),
                editingImageRefs: (this.data.editingImageRefs as string[]).concat(refs).slice(0, HISTORY_MAX_PHOTOS),
              });
            }
            if (failedCount) wx.showToast({ title: `图片上传成功${urls.length}张，失败${failedCount}张`, icon: 'none' });
          })
          .catch(error => wx.showToast({ title: getErrorMessage(error, '图片上传失败'), icon: 'none' }))
          .finally(() => this.setData({ uploadingImages: false }));
      },
    });
  },

  removeContributionImage(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    const images = (this.data.editingImages as string[]).slice();
    const refs = (this.data.editingImageRefs as string[]).slice();
    if (index >= images.length) return;
    images.splice(index, 1);
    refs.splice(index, 1);
    this.setData({ editingImages: images, editingImageRefs: refs });
  },

  async saveContribution() {
    if (this.data.savingContribution || this.data.uploadingImages) return;
    const recordId = String(this.data.recordId || '');
    const participantId = String(this.data.editingParticipantId || '');
    if (!recordId || !participantId) return;
    this.setData({ savingContribution: true });
    try {
      await HistoryService.updateContribution({
        recordId,
        participantId,
        note: String(this.data.editingNote || '').slice(0, HISTORY_MAX_NOTE_LENGTH),
        content: String(this.data.editingNote || '').slice(0, HISTORY_MAX_NOTE_LENGTH),
        images: (this.data.editingImageRefs as string[]).slice(0, HISTORY_MAX_PHOTOS),
        imageRefs: (this.data.editingImageRefs as string[]).slice(0, HISTORY_MAX_PHOTOS),
      });
      this.setData({ editingParticipantId: '', editingNote: '', editingImages: [], editingImageRefs: [] });
      wx.showToast({ title: '回忆已更新', icon: 'success', duration: 1200 });
      this.loadDetail(recordId);
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '保存失败，请稍后重试'), icon: 'none' });
    } finally {
      this.setData({ savingContribution: false });
    }
  },

  previewParticipantImage(event: WechatMiniprogram.TouchEvent) {
    const participantId = String(event.currentTarget.dataset.participantId || '');
    const index = Number(event.currentTarget.dataset.index) || 0;
    const record = this.data.record as DetailRecord | null;
    const participant = record && record.detailParticipants.find(item => item.participantKey === participantId);
    if (!participant || !participant.photoUrls.length) return;
    wx.previewImage({ current: participant.photoUrls[index] || participant.photoUrls[0], urls: participant.photoUrls });
  },

  previewEditingImage(event: WechatMiniprogram.TouchEvent) {
    const images = this.data.editingImages as string[];
    const index = Number(event.currentTarget.dataset.index) || 0;
    if (images.length) wx.previewImage({ current: images[index] || images[0], urls: images });
  },

  onDishImageError(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const record = this.data.record as DetailRecord | null;
    if (!record || index < 0 || index >= record.detailDishes.length) return;
    if (record.detailDishes[index].displayImage !== DEFAULT_IMAGE) {
      this.setData({ [`record.detailDishes[${index}].displayImage`]: DEFAULT_IMAGE });
    }
  },

  onParticipantAvatarError(event: WechatMiniprogram.TouchEvent) {
    const participantId = String(event.currentTarget.dataset.participantId || '');
    const record = this.data.record as DetailRecord | null;
    if (!record) return;
    const index = record.detailParticipants.findIndex(item => item.participantKey === participantId);
    if (index >= 0 && record.detailParticipants[index].displayAvatar !== DEFAULT_IMAGE) {
      this.setData({ [`record.detailParticipants[${index}].displayAvatar`]: DEFAULT_IMAGE });
    }
  },

  onMemoryImageError(event: WechatMiniprogram.TouchEvent) {
    const participantId = String(event.currentTarget.dataset.participantId || '');
    const index = Number(event.currentTarget.dataset.index);
    const record = this.data.record as DetailRecord | null;
    if (!record) return;
    const participantIndex = record.detailParticipants.findIndex(item => item.participantKey === participantId);
    if (participantIndex < 0 || index < 0) return;
    const images = record.detailParticipants[participantIndex].photoUrls.slice();
    if (index < images.length && images[index] !== DEFAULT_IMAGE) {
      images[index] = DEFAULT_IMAGE;
      this.setData({ [`record.detailParticipants[${participantIndex}].photoUrls`]: images });
    }
  },

  async repeatRecord() {
    const record = this.data.record as DetailRecord | null;
    if (!record || !record.repeatIds.length) {
      wx.showModal({ title: '暂时无法再来一次', content: '原菜品已删除或当前没有权限访问，无法自动预填。', showCancel: false });
      return;
    }
    const targetFamilyId = repeatFamilyIdFor(record);
    if (!targetFamilyId) {
      wx.showModal({ title: '暂时无法再来一次', content: '原记录所属家庭已不可用，无法自动预填。', showCancel: false });
      return;
    }
    const currentFamilyId = normalizeFamilyId(FamilyService.getActiveFamilyId() || activeFamilyId());
    const shouldSwitchFamily = Boolean(targetFamilyId && targetFamilyId !== currentFamilyId);
    if (shouldSwitchFamily) {
      try {
        const families = await FamilyService.list();
        const originalFamily = Array.isArray(families)
          && families.find(item => normalizeFamilyId(item && (item.id || item.familyId)) === targetFamilyId);
        if (!originalFamily) {
          wx.showModal({ title: '暂时无法再来一次', content: '原家庭已不存在或你已无权访问，无法自动预填。', showCancel: false });
          return;
        }
      } catch (error) {
        wx.showModal({ title: '暂时无法再来一次', content: '原家庭暂时无法访问，请稍后重试。', showCancel: false });
        return;
      }
    }
    const modalLines: string[] = [];
    if (shouldSwitchFamily) {
      const familyName = String(record.familyName || '原家庭').trim();
      modalLines.push(`这段回忆来自“${familyName}”，继续后会切换到该家庭。`);
    }
    if (record.unavailableNames.length) {
      modalLines.push(`将只带入仍可访问的 ${record.repeatIds.length} 道菜；${record.unavailableNames.join('、')}不会被创建。`);
    }
    if (modalLines.length) {
      const result = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => {
        wx.showModal({
          title: shouldSwitchFamily ? '切换家庭再来一次' : '部分菜品不可用',
          content: modalLines.join('\n\n'),
          confirmText: shouldSwitchFamily ? '切换并继续' : '继续',
          success: resolve,
          fail: () => resolve({ confirm: false, cancel: true, content: '', errMsg: '' }),
        });
      });
      if (!result.confirm) return;
    }

    if (shouldSwitchFamily) {
      // Do not overwrite a family selection made while the modal was open.
      const latestFamilyId = normalizeFamilyId(FamilyService.getActiveFamilyId() || activeFamilyId());
      if (latestFamilyId !== currentFamilyId) {
        wx.showToast({ title: '家庭已切换，请重新操作', icon: 'none' });
        return;
      }
      const selectedFamilyId = normalizeFamilyId(FamilyService.setActiveFamilyId(targetFamilyId));
      if (selectedFamilyId !== targetFamilyId) {
        wx.showToast({ title: '原家庭暂时无法切换', icon: 'none' });
        return;
      }
    }
    const query = `prefillDishIds=${encodeURIComponent(record.repeatIds.join(','))}&mealType=${encodeURIComponent(String(record.mealType || ''))}`;
    wx.navigateTo({ url: `/pages/appointment/booking/booking?${query}` });
  },

  async excludeRecord() {
    const record = this.data.record as DetailRecord | null;
    if (!record || !record.canExclude || record.frozen === true || Boolean(record.frozenAt) || this.data.actionLoading) return;
    const confirmed = await this.confirm('从我的回忆移除', '这只会从你的个人历史中隐藏，家庭共享时间线不会受影响。');
    if (!confirmed) return;
    this.setData({ actionLoading: true });
    try {
      await HistoryService.excludeHistory(record.id, true);
      wx.showToast({ title: '已从我的回忆移除', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack(), 650);
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '移除失败，请稍后重试'), icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  async deleteRecord() {
    const record = this.data.record as DetailRecord | null;
    if (!record || !record.canDelete || record.frozen === true || Boolean(record.frozenAt) || this.data.actionLoading) return;
    const confirmed = await this.confirm('删除这段回忆', '删除后这条手动记录和其中的贡献将从时间线移除，成就进度也会重新计算。');
    if (!confirmed) return;
    this.setData({ actionLoading: true });
    try {
      await HistoryService.deleteHistory(record.id);
      wx.showToast({ title: '回忆已删除', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack(), 650);
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error, '删除失败，请稍后重试'), icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  confirm(title: string, content: string): Promise<boolean> {
    return new Promise(resolve => {
      wx.showModal({ title, content, confirmText: '确定', confirmColor: '#c9493c', success: result => resolve(!!result.confirm), fail: () => resolve(false) });
    });
  },

  retryAfterError(error: unknown) {
    if (getErrorCode(error)) this.retry();
  },

  noop() {},
});
