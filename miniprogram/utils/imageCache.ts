interface ImageCacheEntry {
  url: string;
  localPath: string;
  size: number;
  savedAt: number;
  lastAccess: number;
}

type ImageCacheMap = Record<string, ImageCacheEntry>;

const CACHE_STORAGE_KEY = 'image_cache_v1';
const MAX_CACHE_ITEMS = 120;
const MAX_CACHE_BYTES = 30 * 1024 * 1024;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

const pendingDownloads: Partial<Record<string, Promise<string>>> = {};
const failedUntil: Record<string, number> = {};
let memoryCache: ImageCacheMap | null = null;
let cacheGeneration = 0;

function isRemoteImage(url?: string): url is string {
  if (!url) return false;
  const value = url.trim();
  return value.startsWith('http://') || value.startsWith('https://');
}

function normalizeCacheKey(url: string): string {
  return url.trim().split('#')[0];
}

function getCacheMap(): ImageCacheMap {
  if (memoryCache) return memoryCache;

  const value = wx.getStorageSync(CACHE_STORAGE_KEY);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    memoryCache = value as ImageCacheMap;
  } else {
    memoryCache = {};
  }

  return memoryCache;
}

function saveCacheMap(map: ImageCacheMap) {
  memoryCache = map;
  wx.setStorageSync(CACHE_STORAGE_KEY, map);
}

function isLocalFileAvailable(localPath: string): boolean {
  if (!localPath) return false;

  try {
    const fs = wx.getFileSystemManager() as any;
    fs.accessSync(localPath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error(`图片下载失败: ${res.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

function saveTempFile(tempFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.saveFile({
      tempFilePath,
      success: (res) => resolve(res.savedFilePath),
      fail: reject
    });
  });
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(res.size || 0),
      fail: () => resolve(0)
    });
  });
}

function removeSavedFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve();
      return;
    }

    wx.removeSavedFile({
      filePath,
      complete: () => resolve()
    });
  });
}

export class ImageCacheService {
  static isCacheable(url?: string): boolean {
    return isRemoteImage(url);
  }

  static async resolve(url?: string): Promise<string> {
    if (!isRemoteImage(url)) return url || '';

    const key = normalizeCacheKey(url);
    const map = getCacheMap();
    const cached = map[key];
    const now = Date.now();

    if (cached) {
      if (isLocalFileAvailable(cached.localPath)) {
        cached.lastAccess = now;
        saveCacheMap(map);
        return cached.localPath;
      }

      delete map[key];
      saveCacheMap(map);
    }

    if (failedUntil[key] && failedUntil[key] > now) {
      return url;
    }

    if (pendingDownloads[key]) {
      return pendingDownloads[key];
    }

    const downloadPromise = this.downloadAndSave(url, key);
    pendingDownloads[key] = downloadPromise;
    downloadPromise.then(
      () => {
        if (pendingDownloads[key] === downloadPromise) delete pendingDownloads[key];
      },
      () => {
        if (pendingDownloads[key] === downloadPromise) delete pendingDownloads[key];
      }
    );

    return pendingDownloads[key];
  }

  static async withCachedImages<T extends object, K extends string = 'cachedImage'>(
    items: T[],
    getUrl: (item: T) => string | undefined,
    targetField: K = 'cachedImage' as K
  ): Promise<Array<T & Record<K, string>>> {
    const uniqueUrls = Array.from(new Set(
      items
        .map(getUrl)
        .filter((url): url is string => Boolean(url))
    ));

    const resolvedPairs = await Promise.all(
      uniqueUrls.map(async (url) => [url, await this.resolve(url)] as const)
    );
    const resolvedMap = new Map<string, string>(resolvedPairs);

    return items.map(item => {
      const url = getUrl(item) || '';
      return {
        ...item,
        [targetField]: resolvedMap.get(url) || url
      } as T & Record<K, string>;
    });
  }

  static async clear(): Promise<void> {
    cacheGeneration += 1;
    Object.keys(pendingDownloads).forEach(key => {
      delete pendingDownloads[key];
    });
    const map = getCacheMap();
    const entries = Object.values({ ...map });
    memoryCache = {};
    Object.keys(failedUntil).forEach(key => {
      delete failedUntil[key];
    });
    wx.removeStorageSync(CACHE_STORAGE_KEY);
    await Promise.all(entries.map(entry => removeSavedFile(entry.localPath)));
  }

  private static async downloadAndSave(url: string, key: string): Promise<string> {
    const generation = cacheGeneration;
    let localPath = '';
    try {
      const tempFilePath = await downloadFile(url);
      const map = getCacheMap();

      try {
        localPath = await saveTempFile(tempFilePath);
      } catch {
        if (generation !== cacheGeneration) return url;
        await this.prune(map, true);
        localPath = await saveTempFile(tempFilePath);
      }

      if (generation !== cacheGeneration) {
        await removeSavedFile(localPath);
        return url;
      }

      const size = await getFileSize(localPath);
      const now = Date.now();
      map[key] = {
        url,
        localPath,
        size,
        savedAt: now,
        lastAccess: now
      };

      await this.prune(map, false);
      if (generation !== cacheGeneration) {
        delete map[key];
        await removeSavedFile(localPath);
        return url;
      }
      saveCacheMap(map);
      return localPath;
    } catch (error) {
      if (generation === cacheGeneration) failedUntil[key] = Date.now() + FAILURE_COOLDOWN_MS;
      console.warn('图片缓存失败，回退远程地址:', url, error);
      return url;
    }
  }

  private static async prune(map: ImageCacheMap, aggressive: boolean): Promise<void> {
    let entries = Object.entries(map);
    let totalSize = entries.reduce((sum, [, entry]) => sum + (entry.size || 0), 0);
    const targetCount = aggressive ? Math.floor(MAX_CACHE_ITEMS * 0.75) : MAX_CACHE_ITEMS;
    const targetBytes = aggressive ? Math.floor(MAX_CACHE_BYTES * 0.75) : MAX_CACHE_BYTES;

    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    while (entries.length > targetCount || totalSize > targetBytes) {
      const oldest = entries.shift();
      if (!oldest) break;

      const [key, entry] = oldest;
      delete map[key];
      totalSize -= entry.size || 0;
      await removeSavedFile(entry.localPath);
    }
  }
}
