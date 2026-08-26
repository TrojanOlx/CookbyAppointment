import { describe, expect, it } from 'vitest';
import {
  APP_SHARE_PATH,
  createAppShareContent,
  createAppTimelineContent,
  createDishFavoriteContent,
  createDishShareContent,
  createFamilyInviteShareContent
} from '../../miniprogram/utils/share';

describe('miniprogram share content', () => {
  it('uses the public home page for generic app shares', () => {
    const content = createAppShareContent();
    expect(content.path).toBe(APP_SHARE_PATH);
    expect(content.title).toContain('家庭菜单预约');
    expect(content.imageUrl).toBe('/images/share/app-share.jpg');
  });

  it('uses the stable branded image for Timeline sharing', () => {
    expect(createAppTimelineContent()).toEqual({
      title: expect.stringContaining('家庭菜单预约'),
      imageUrl: '/images/share/app-share.jpg'
    });
  });

  it('encodes dish and family identifiers in private dish deep links', () => {
    const content = createDishShareContent({
      id: 'dish/1',
      name: '番茄 鸡蛋',
      images: ['https://images.example.com/dish.jpg?signature=abc']
    }, 'family A');

    expect(content.path).toBe('/pages/menu/detail/detail?id=dish%2F1&familyId=family%20A');
    expect(content.title).toBe('家庭菜谱：番茄 鸡蛋');
    expect(content.imageUrl).toContain('https://images.example.com/dish.jpg');
  });

  it('uses a stable fallback for temporary local images', () => {
    const dish = { id: 'dish-1', name: '测试菜', images: ['wxfile://tmp/dish.jpg'] };
    expect(createDishShareContent(dish, 'family-1').imageUrl).toBe('/images/default-dish.jpg');
    expect(createDishFavoriteContent(dish, 'family-1').imageUrl).toBe('/images/default-dish.jpg');
  });

  it('creates a branded invitation share without exposing the current page screenshot', () => {
    const content = createFamilyInviteShareContent('token/with spaces', 'Trojan-X 的家');
    expect(content.title).toBe('邀请你加入「Trojan-X 的家」');
    expect(content.path).toBe('/pages/family/invite/invite?token=token%2Fwith%20spaces');
    expect(content.imageUrl).toBe('/images/share/app-share.jpg');
  });

  it('falls back to the public app share when an invitation has no token', () => {
    expect(createFamilyInviteShareContent('', '测试家庭')).toEqual(createAppShareContent());
  });

  it('keeps the invitation title balanced for very long family names', () => {
    const content = createFamilyInviteShareContent('token', '很长的家庭名称'.repeat(20));
    expect(content.title.length).toBeLessThanOrEqual(64);
    expect(content.title.endsWith('」')).toBe(true);
  });

  it('does not send unsupported image formats to the WeChat share API', () => {
    const webpDish = { id: 'dish-1', name: '测试菜', images: ['https://images.example.com/dish.webp'] };
    const opaqueDownload = { id: 'dish-2', name: '测试菜', images: ['https://wx.example.com/api/file/download?id=1'] };
    expect(createDishShareContent(webpDish, 'family-1').imageUrl).toBe('/images/default-dish.jpg');
    expect(createDishShareContent(opaqueDownload, 'family-1').imageUrl).toBe('/images/default-dish.jpg');
  });

  it('falls back to the app entry when dish data has not loaded', () => {
    expect(createDishShareContent(null, 'family-1')).toEqual(createAppShareContent());
  });

  it('does not create a private dish link without a family context', () => {
    expect(createDishShareContent({ id: 'dish-1', name: '测试菜' }, '')).toEqual(createAppShareContent());
  });
});
