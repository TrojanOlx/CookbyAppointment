import type { Dish } from '../models/dish';

export interface AppShareContent {
  title: string;
  path: string;
  imageUrl?: string;
}

export interface TimelineShareContent {
  title: string;
  imageUrl?: string;
}

export interface FavoriteContent {
  title: string;
  query: string;
  imageUrl?: string;
}

export const APP_SHARE_TITLE = '家庭菜单预约 - 一起安排家里的每一餐';
export const APP_SHARE_PATH = '/pages/index/index';
export const APP_SHARE_IMAGE = '/images/share/app-share.jpg';
export const DISH_SHARE_FALLBACK_IMAGE = '/images/default-dish.jpg';

const normalizeTitle = (value: unknown, fallback: string): string => {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  return (title || fallback).slice(0, 64);
};

const buildQuery = (entries: Array<[string, unknown]>): string => entries
  .filter(([, value]) => String(value || '').trim())
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value).trim())}`)
  .join('&');

const shareableImage = (value: unknown): string => {
  const imageUrl = String(value || '').trim();
  if (!imageUrl || /^(?:wxfile|http:\/\/tmp|tmp_)/i.test(imageUrl)) return '';
  const path = imageUrl.split(/[?#]/, 1)[0].toLowerCase();
  return /\.(?:jpe?g|png)$/.test(path) ? imageUrl : '';
};

export const createAppShareContent = (): AppShareContent => ({
  title: APP_SHARE_TITLE,
  path: APP_SHARE_PATH,
  imageUrl: APP_SHARE_IMAGE
});

export const createAppTimelineContent = (): TimelineShareContent => ({
  title: APP_SHARE_TITLE,
  imageUrl: APP_SHARE_IMAGE
});

export const createFamilyInviteShareContent = (
  token: string,
  familyName?: string
): AppShareContent => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return createAppShareContent();

  const normalizedFamilyName = normalizeTitle(familyName, '家庭小岛').slice(0, 48);
  return {
    title: normalizeTitle(`邀请你加入「${normalizedFamilyName}」`, '邀请你加入家庭小岛'),
    path: `/pages/family/invite/invite?${buildQuery([['token', normalizedToken]])}`,
    imageUrl: APP_SHARE_IMAGE
  };
};

export const createDishShareContent = (
  dish: Partial<Dish> | null | undefined,
  familyId: string
): AppShareContent => {
  const dishId = String(dish?.id || '').trim();
  const normalizedFamilyId = String(familyId || '').trim();
  if (!dishId || !normalizedFamilyId) return createAppShareContent();

  const imageUrl = shareableImage(Array.isArray(dish?.images) ? dish?.images[0] : '')
    || DISH_SHARE_FALLBACK_IMAGE;
  return {
    title: normalizeTitle(dish?.name ? `家庭菜谱：${dish.name}` : '', APP_SHARE_TITLE),
    path: `/pages/menu/detail/detail?${buildQuery([
      ['id', dishId],
      ['familyId', normalizedFamilyId]
    ])}`,
    imageUrl
  };
};

export const createDishFavoriteContent = (
  dish: Partial<Dish> | null | undefined,
  familyId: string
): FavoriteContent => {
  const imageUrl = shareableImage(Array.isArray(dish?.images) ? dish?.images[0] : '')
    || DISH_SHARE_FALLBACK_IMAGE;
  return {
    title: normalizeTitle(dish?.name, '家庭菜谱'),
    query: buildQuery([
      ['id', dish?.id],
      ['familyId', familyId]
    ]),
    imageUrl
  };
};
