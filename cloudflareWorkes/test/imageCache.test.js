import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ImageCacheService', () => {
  let storage;
  let downloads;

  beforeEach(() => {
    vi.resetModules();
    storage = new Map([['active_family_id', 'family-a']]);
    downloads = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('wx', {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key),
      getFileSystemManager: () => ({ accessSync: () => { throw new Error('missing'); } }),
      downloadFile: vi.fn(options => downloads.push(options)),
      saveFile: vi.fn(),
      getFileInfo: vi.fn(),
      removeSavedFile: vi.fn(options => options.complete?.()),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the remote URL before a cache download finishes', async () => {
    const { ImageCacheService } = await import('../../miniprogram/utils/imageCache');
    const onResolved = vi.fn();
    const url = 'https://wx.example.test/api/file/download?id=file-1&signature=a';

    const initial = await ImageCacheService.withCachedImages(
      [{ id: 'dish-1', image: url }],
      item => item.image,
      'cachedImage',
      { getIdentity: () => ({ familyId: 'family-a', fileId: 'file-1' }), onResolved },
    );

    expect(initial).toEqual([{ id: 'dish-1', image: url, cachedImage: url }]);
    expect(downloads).toHaveLength(1);
    expect(onResolved).not.toHaveBeenCalled();

    downloads[0].fail(new Error('offline'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('deduplicates a file download while preserving each caller fallback URL', async () => {
    const { ImageCacheService } = await import('../../miniprogram/utils/imageCache');
    const firstUrl = 'https://wx.example.test/api/file/download?id=file-1&signature=old';
    const secondUrl = 'https://wx.example.test/api/file/download?id=file-1&signature=fresh';
    const first = ImageCacheService.resolve(firstUrl, { familyId: 'family-a' });
    const second = ImageCacheService.resolve(secondUrl, { familyId: 'family-a' });

    expect(downloads).toHaveLength(1);
    downloads[0].fail(new Error('expired signature'));

    await expect(Promise.all([first, second])).resolves.toEqual([firstUrl, secondUrl]);
  });

  it('limits background downloads to three at a time', async () => {
    const { ImageCacheService } = await import('../../miniprogram/utils/imageCache');
    const pending = Array.from({ length: 5 }, (_, index) => ImageCacheService.resolve(
      `https://wx.example.test/api/file/download?id=file-${index}`,
      { familyId: 'family-a' },
    ));

    expect(downloads).toHaveLength(3);
    downloads.slice(0, 3).forEach(request => request.fail(new Error('offline')));
    await vi.waitFor(() => expect(downloads).toHaveLength(5));
    downloads.slice(3).forEach(request => request.fail(new Error('offline')));

    await expect(Promise.all(pending)).resolves.toHaveLength(5);
  });

  it('cancels queued downloads when the cache is cleared', async () => {
    const { ImageCacheService } = await import('../../miniprogram/utils/imageCache');
    const pending = Array.from({ length: 5 }, (_, index) => ImageCacheService.resolve(
      `https://wx.example.test/api/file/download?id=queued-${index}`,
      { familyId: 'family-a' },
    ));

    expect(downloads).toHaveLength(3);
    await ImageCacheService.clear();
    downloads.forEach(request => request.fail(new Error('cancel active download')));

    await expect(Promise.all(pending)).resolves.toHaveLength(5);
    expect(downloads).toHaveLength(3);
  });

  it('allows a fresh signed URL after an older signature fails', async () => {
    const { ImageCacheService } = await import('../../miniprogram/utils/imageCache');
    const oldUrl = 'https://wx.example.test/api/file/download?id=file-2&signature=old';
    const freshUrl = 'https://wx.example.test/api/file/download?id=file-2&signature=fresh';

    const oldResult = ImageCacheService.resolve(oldUrl, { familyId: 'family-a' });
    downloads[0].fail(new Error('expired signature'));
    await expect(oldResult).resolves.toBe(oldUrl);

    const freshResult = ImageCacheService.resolve(freshUrl, { familyId: 'family-a' });
    expect(downloads).toHaveLength(2);
    downloads[1].fail(new Error('offline'));
    await expect(freshResult).resolves.toBe(freshUrl);
  });
});
