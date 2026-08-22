interface ImageCacheEntry {
  url: string;
  localPath: string;
  size: number;
  savedAt: number;
  lastAccess: number;
}

export interface ImageCacheIdentity {
  familyId?: string;
  fileId?: string;
}

export interface ImageCacheUpdate<K extends string = string> {
  index: number;
  field: K;
  value: string;
}

interface WithCachedImagesOptions<T, K extends string> {
  getIdentity?: (item: T) => ImageCacheIdentity | undefined;
  onResolved?: (updates: Array<ImageCacheUpdate<K>>) => void;
}

type ImageCacheMap = Record<string, ImageCacheEntry>;

interface QueuedDownload {
  start: () => void;
  cancel: () => void;
}

const CACHE_STORAGE_KEY = 'image_cache_v2';
const LEGACY_CACHE_STORAGE_KEY = 'image_cache_v1';
const MAX_CACHE_ITEMS = 120;
const MAX_CACHE_BYTES = 30 * 1024 * 1024;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const ACCESS_WRITE_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_DOWNLOADS = 3;

const pendingDownloads: Partial<Record<string, Promise<string>>> = {};
const failedUntil: Record<string, number> = {};
const downloadQueue: QueuedDownload[] = [];
let activeDownloads = 0;
let memoryCache: ImageCacheMap | null = null;
let cacheGeneration = 0;
let accessWriteTimer: ReturnType<typeof setTimeout> | null = null;

function isRemoteImage(url?: string): url is string {
  if (!url) return false;
  const value = url.trim();
  return value.startsWith('http://') || value.startsWith('https://');
}

function activeFamilyId(): string {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') return String(value.id || value.familyId || value.family_id || '');
  return value ? String(value) : 'global';
}

function fileIdFromUrl(url: string): string {
  const match = url.match(/[?&]id=([^&#]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function canonicalUrl(url: string): string {
  return url.trim().split('#')[0].split('?')[0];
}

function normalizeCacheKey(url: string, identity?: ImageCacheIdentity): string {
  const familyId = identity?.familyId || activeFamilyId();
  const fileId = identity?.fileId || fileIdFromUrl(url);
  return `${familyId}:${fileId || canonicalUrl(url)}`;
}

function downloadFailureKey(cacheKey: string, url: string): string {
  return `${cacheKey}|${url}`;
}

function isDevelopEnvironment(): boolean {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
  } catch {
    return false;
  }
}

function getCacheMap(): ImageCacheMap {
  if (memoryCache) return memoryCache;
  const value = wx.getStorageSync(CACHE_STORAGE_KEY);
  memoryCache = value && typeof value === 'object' && !Array.isArray(value)
    ? value as ImageCacheMap
    : {};
  return memoryCache;
}

function persistCacheMap(map: ImageCacheMap): void {
  memoryCache = map;
  wx.setStorageSync(CACHE_STORAGE_KEY, map);
}

function scheduleAccessWrite(): void {
  if (accessWriteTimer) return;
  accessWriteTimer = setTimeout(() => {
    accessWriteTimer = null;
    if (memoryCache) persistCacheMap(memoryCache);
  }, ACCESS_WRITE_INTERVAL_MS);
}

function isLocalFileAvailable(localPath: string): boolean {
  if (!localPath) return false;
  try {
    (wx.getFileSystemManager() as any).accessSync(localPath);
    return true;
  } catch {
    return false;
  }
}

function runQueuedDownload<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const generation = cacheGeneration;
    const start = () => {
      if (generation !== cacheGeneration) {
        reject(new Error('图片缓存任务已取消'));
        return;
      }
      activeDownloads += 1;
      task().then(resolve, reject).then(() => {
        activeDownloads -= 1;
        const next = downloadQueue.shift();
        if (next) next.start();
      });
    };
    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) start();
    else downloadQueue.push({ start, cancel: () => reject(new Error('图片缓存任务已取消')) });
  });
}

function downloadFile(url: string): Promise<string> {
  return runQueuedDownload(() => new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error(`图片下载失败: ${res.statusCode}`));
      },
      fail: reject,
    });
  }));
}

function saveTempFile(tempFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.saveFile({ tempFilePath, success: res => resolve(String(res.savedFilePath)), fail: reject });
  });
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise(resolve => {
    wx.getFileInfo({ filePath, success: res => resolve(res.size || 0), fail: () => resolve(0) });
  });
}

function removeSavedFile(filePath: string): Promise<void> {
  return new Promise(resolve => {
    if (!filePath) return resolve();
    wx.removeSavedFile({ filePath, complete: () => resolve() });
  });
}

export class ImageCacheService {
  static isCacheable(url?: string): boolean {
    return isRemoteImage(url);
  }

  static peek(url?: string, identity?: ImageCacheIdentity): string {
    if (!isRemoteImage(url)) return url || '';
    const key = normalizeCacheKey(url, identity);
    const map = getCacheMap();
    const cached = map[key];
    if (!cached) return url;
    if (!isLocalFileAvailable(cached.localPath)) {
      delete map[key];
      persistCacheMap(map);
      return url;
    }
    cached.lastAccess = Date.now();
    scheduleAccessWrite();
    return cached.localPath;
  }

  static async resolve(url?: string, identity?: ImageCacheIdentity): Promise<string> {
    if (!isRemoteImage(url)) return url || '';
    const cached = this.peek(url, identity);
    if (cached !== url) return cached;
    const key = normalizeCacheKey(url, identity);
    const failureKey = downloadFailureKey(key, url);
    const now = Date.now();
    if (failedUntil[failureKey] && failedUntil[failureKey] > now) return url;
    if (pendingDownloads[key]) return (await pendingDownloads[key]) || url;
    const pending = this.downloadAndSave(url, key, failureKey);
    pendingDownloads[key] = pending;
    const release = () => {
      if (pendingDownloads[key] === pending) delete pendingDownloads[key];
    };
    void pending.then(release, release);
    return (await pending) || url;
  }

  static async withCachedImages<T extends object, K extends string = 'cachedImage'>(
    items: T[],
    getUrl: (item: T) => string | undefined,
    targetField: K = 'cachedImage' as K,
    options: WithCachedImagesOptions<T, K> = {},
  ): Promise<Array<T & Record<K, string>>> {
    const initial = items.map(item => {
      const url = getUrl(item) || '';
      return { ...item, [targetField]: this.peek(url, options.getIdentity?.(item)) } as T & Record<K, string>;
    });
    const work = items.map(async (item, index): Promise<ImageCacheUpdate<K> | null> => {
      const url = getUrl(item) || '';
      if (!isRemoteImage(url)) return null;
      const value = await this.resolve(url, options.getIdentity?.(item));
      return value !== initial[index][targetField] ? { index, field: targetField, value } : null;
    });
    void Promise.all(work).then(results => {
      const updates = results.filter((item): item is ImageCacheUpdate<K> => Boolean(item));
      if (updates.length) options.onResolved?.(updates);
    });
    return initial;
  }

  static async clear(): Promise<void> {
    cacheGeneration += 1;
    if (accessWriteTimer) {
      clearTimeout(accessWriteTimer);
      accessWriteTimer = null;
    }
    downloadQueue.splice(0).forEach(item => item.cancel());
    Object.keys(pendingDownloads).forEach(key => delete pendingDownloads[key]);
    Object.keys(failedUntil).forEach(key => delete failedUntil[key]);
    const entries = Object.values({ ...getCacheMap() });
    memoryCache = {};
    wx.removeStorageSync(CACHE_STORAGE_KEY);
    wx.removeStorageSync(LEGACY_CACHE_STORAGE_KEY);
    await Promise.all(entries.map(entry => removeSavedFile(entry.localPath)));
  }

  private static async downloadAndSave(url: string, key: string, failureKey: string): Promise<string> {
    const generation = cacheGeneration;
    let localPath = '';
    try {
      const tempFilePath = await downloadFile(url);
      const map = getCacheMap();
      try {
        localPath = await saveTempFile(tempFilePath);
      } catch {
        if (generation !== cacheGeneration) return '';
        await this.prune(map, true);
        localPath = await saveTempFile(tempFilePath);
      }
      if (generation !== cacheGeneration) {
        await removeSavedFile(localPath);
        return '';
      }
      map[key] = {
        url,
        localPath,
        size: await getFileSize(localPath),
        savedAt: Date.now(),
        lastAccess: Date.now(),
      };
      await this.prune(map, false);
      if (generation !== cacheGeneration) {
        delete map[key];
        await removeSavedFile(localPath);
        return '';
      }
      persistCacheMap(map);
      return localPath;
    } catch (error) {
      if (generation === cacheGeneration) failedUntil[failureKey] = Date.now() + FAILURE_COOLDOWN_MS;
      if (isDevelopEnvironment()) {
        console.warn('图片缓存失败，回退远程地址:', canonicalUrl(url), error instanceof Error ? error.message : 'download failed');
      }
      return '';
    }
  }

  private static async prune(map: ImageCacheMap, aggressive: boolean): Promise<void> {
    const entries = Object.entries(map).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    let totalSize = entries.reduce((sum, [, entry]) => sum + (entry.size || 0), 0);
    const targetCount = aggressive ? Math.floor(MAX_CACHE_ITEMS * 0.75) : MAX_CACHE_ITEMS;
    const targetBytes = aggressive ? Math.floor(MAX_CACHE_BYTES * 0.75) : MAX_CACHE_BYTES;
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
