import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionCacheService } from '../../miniprogram/utils/sessionCache';

describe('SessionCacheService', () => {
  afterEach(() => {
    SessionCacheService.clear();
    vi.useRealTimers();
  });

  it('keeps business data only until its TTL expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T00:00:00Z'));
    SessionCacheService.set('family-a|inventory', 'inventory', { total: 1 }, 30_000);

    expect(SessionCacheService.get('family-a|inventory', 'inventory')).toEqual({ total: 1 });
    vi.advanceTimersByTime(30_001);
    expect(SessionCacheService.get('family-a|inventory', 'inventory')).toBeUndefined();
  });

  it('invalidates only the mutated resource', () => {
    SessionCacheService.set('dishes', 'dish', ['dish-a'], 60_000);
    SessionCacheService.set('inventory', 'inventory', ['stock-a'], 30_000);
    SessionCacheService.set('inventory-page-2', 'inventory', ['stock-b'], 30_000);
    SessionCacheService.markDirty('inventory');
    SessionCacheService.set('inventory', 'inventory', ['stock-new'], 30_000);

    expect(SessionCacheService.get('inventory', 'inventory')).toEqual(['stock-new']);
    expect(SessionCacheService.get('inventory-page-2', 'inventory')).toBeUndefined();
    expect(SessionCacheService.get('dishes', 'dish')).toEqual(['dish-a']);
  });

  it('changes the resource generation when a write invalidates pending reads', () => {
    const inventoryGeneration = SessionCacheService.generation('inventory');
    const dishGeneration = SessionCacheService.generation('dish');

    SessionCacheService.markDirty('inventory');

    expect(SessionCacheService.generation('inventory')).not.toBe(inventoryGeneration);
    expect(SessionCacheService.generation('dish')).toBe(dishGeneration);
  });

  it('changes the session generation even when resource counters reset', () => {
    const generation = SessionCacheService.generation('inventory');
    SessionCacheService.markDirty('inventory');
    SessionCacheService.clear();

    expect(SessionCacheService.generation('inventory')).not.toBe(generation);
  });

  it('clears every family and account entry at a session boundary', () => {
    SessionCacheService.set('family-a', 'family', { id: 'a' }, 300_000);
    SessionCacheService.set('family-b', 'family', { id: 'b' }, 300_000);
    SessionCacheService.clear();

    expect(SessionCacheService.get('family-a', 'family')).toBeUndefined();
    expect(SessionCacheService.get('family-b', 'family')).toBeUndefined();
  });
});
