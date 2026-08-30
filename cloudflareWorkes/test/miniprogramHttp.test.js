import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('miniprogram HTTP session behavior', () => {
  let storage;
  let requests;

  beforeEach(() => {
    vi.resetModules();
    storage = new Map([
      ['token', 'token-a'],
      ['active_family_id', 'family-a'],
    ]);
    requests = [];
    vi.stubGlobal('wx', {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release', version: '1.0.1-test' } }),
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key),
      login: vi.fn(options => options.success({ code: 'fresh-code' })),
      request: vi.fn(options => requests.push(options)),
      removeSavedFile: vi.fn(),
      getFileSystemManager: () => ({ accessSync: vi.fn() }),
      showModal: vi.fn(),
      switchTab: vi.fn(),
    });
    vi.stubGlobal('getApp', () => ({ globalData: { eventBus: { emit: vi.fn() } } }));
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/index/index' }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the production API only for release builds', async () => {
    const http = await import('../../miniprogram/services/http');
    expect(http.BASE_URL).toBe('https://homemenu.yunma.oulongxing.com');
  });

  it.each(['develop', 'trial'])('uses the staging API for %s builds', async envVersion => {
    wx.getAccountInfoSync = () => ({ miniProgram: { envVersion, version: '1.0.3-test' } });
    vi.resetModules();
    const http = await import('../../miniprogram/services/http');
    expect(http.BASE_URL).toBe('https://homemenu-staging.yunma.oulongxing.com');
  });

  it('deduplicates identical GETs and reuses the TTL cache', async () => {
    const http = await import('../../miniprogram/services/http');
    const options = { resource: 'inventory', ttlMs: 30_000 };
    const first = http.getCached('/api/inventory/list', { page: 1 }, options);
    const second = http.getCached('/api/inventory/list', { page: 1 }, options);

    expect(requests).toHaveLength(1);
    expect(requests[0].timeout).toBe(12_000);
    requests[0].success({ statusCode: 200, data: { list: ['fresh'] }, header: {} });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { list: ['fresh'] },
      { list: ['fresh'] },
    ]);
    await expect(http.getCached('/api/inventory/list', { page: 1 }, options)).resolves.toEqual({ list: ['fresh'] });
    expect(requests).toHaveLength(1);
  });

  it('discards a pending GET after a related write and retries once', async () => {
    const http = await import('../../miniprogram/services/http');
    const pendingRead = http.getCached('/api/inventory/list', { page: 1 }, {
      resource: 'inventory',
      ttlMs: 30_000,
    });
    const write = http.post('/api/inventory/add', { name: '鸡蛋', amount: '2个' });

    expect(requests).toHaveLength(2);
    requests[1].success({ statusCode: 201, data: { id: 'stock-2' }, header: {} });
    await expect(write).resolves.toEqual({ id: 'stock-2' });

    requests[0].success({ statusCode: 200, data: { list: ['stale'] }, header: {} });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].success({ statusCode: 200, data: { list: ['fresh'] }, header: {} });

    await expect(pendingRead).resolves.toEqual({ list: ['fresh'] });
    await expect(http.getCached('/api/inventory/list', { page: 1 }, {
      resource: 'inventory', ttlMs: 30_000,
    })).resolves.toEqual({ list: ['fresh'] });
    expect(requests).toHaveLength(3);
  });

  it('rejects a response from the previously selected family', async () => {
    const http = await import('../../miniprogram/services/http');
    const pending = http.get('/api/inventory/list', { page: 1 }, { cache: false });
    storage.set('active_family_id', 'family-b');
    requests[0].success({ statusCode: 200, data: { list: ['family-a'] }, header: {} });

    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });

  it('does not allow a caller header to override the active family', async () => {
    const http = await import('../../miniprogram/services/http');
    const pending = http.request({
      url: '/api/inventory/list',
      method: 'GET',
      header: { 'X-Family-Id': 'family-b' },
    });

    expect(requests[0].header['X-Family-Id']).toBe('family-a');
    requests[0].success({ statusCode: 200, data: { list: [] }, header: {} });
    await expect(pending).resolves.toEqual({ list: [] });
  });

  it('applies the shared timeout to silent token refresh', async () => {
    const http = await import('../../miniprogram/services/http');
    const pending = http.get('/api/inventory/list', undefined, { cache: false });
    requests[0].success({ statusCode: 401, data: { code: 'UNAUTHORIZED' }, header: {} });

    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].url).toContain('/api/user/login');
    expect(requests[1].timeout).toBe(12_000);
    requests[1].success({ statusCode: 200, data: { token: 'token-b', openid: 'openid-b' }, header: {} });

    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].success({ statusCode: 200, data: { list: ['fresh'] }, header: {} });
    await expect(pending).resolves.toEqual({ list: ['fresh'] });
  });

  it('preserves the complete deep link when an expired session requires login', async () => {
    vi.stubGlobal('getCurrentPages', () => [{
      route: 'pages/menu/detail/detail',
      options: { id: 'dish/1', familyId: 'family A' },
    }]);
    const http = await import('../../miniprogram/services/http');
    const pending = http.get('/api/dish/detail', { id: 'dish/1' }, { cache: false });
    requests[0].success({ statusCode: 401, data: { code: 'UNAUTHORIZED' }, header: {} });

    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].success({ statusCode: 401, data: { code: 'INVALID_CODE' }, header: {} });

    await expect(pending).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(storage.get('redirectUrl')).toBe(
      '/pages/menu/detail/detail?id=dish%2F1&familyId=family%20A'
    );
  });

  it('returns the structured error contract without logging response bodies', async () => {
    const http = await import('../../miniprogram/services/http');
    const pending = http.get('/api/inventory/list', undefined, { cache: false });
    requests[0].success({
      statusCode: 503,
      data: { code: 'D1_UNAVAILABLE', message: '服务暂不可用', details: { retryAfter: 1 } },
      header: { 'x-request-id': 'request-1' },
    });

    await expect(pending).rejects.toMatchObject({
      status: 503,
      code: 'D1_UNAVAILABLE',
      message: '服务暂不可用',
      details: { retryAfter: 1 },
      requestId: 'request-1',
      retriable: true,
    });
  });
});
