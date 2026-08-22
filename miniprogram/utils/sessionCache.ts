export type SessionResource =
  | 'home'
  | 'dish'
  | 'inventory'
  | 'appointment'
  | 'shopping'
  | 'family'
  | 'profile'
  | string;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  resource: SessionResource;
  generation: number;
}

const entries = new Map<string, CacheEntry>();
const dirtyResources = new Set<SessionResource>();
const resourceGenerations = new Map<SessionResource, number>();
let sessionGeneration = 0;

const resourceGeneration = (resource: SessionResource): number => resourceGenerations.get(resource) || 0;

export const SESSION_CACHE_TTL = {
  home: 60_000,
  dish: 60_000,
  inventory: 30_000,
  appointment: 30_000,
  shopping: 30_000,
  family: 5 * 60_000,
  profile: 5 * 60_000,
} as const;

export class SessionCacheService {
  static generation(resource?: SessionResource): string {
    return `${sessionGeneration}:${resource ? resourceGeneration(resource) : 0}`;
  }

  static get<T>(key: string, resource: SessionResource): T | undefined {
    const entry = entries.get(key);
    if (
      !entry
      || entry.resource !== resource
      || entry.generation !== resourceGeneration(resource)
      || dirtyResources.has(resource)
      || entry.expiresAt <= Date.now()
    ) {
      return undefined;
    }
    return entry.value as T;
  }

  static set<T>(key: string, resource: SessionResource, value: T, ttlMs: number): T {
    entries.set(key, {
      value,
      resource,
      expiresAt: Date.now() + Math.max(0, ttlMs),
      generation: resourceGeneration(resource),
    });
    dirtyResources.delete(resource);
    return value;
  }

  static markDirty(...resources: SessionResource[]): void {
    resources.forEach(resource => {
      resourceGenerations.set(resource, resourceGeneration(resource) + 1);
      dirtyResources.add(resource);
    });
  }

  static isDirty(resource: SessionResource): boolean {
    return dirtyResources.has(resource);
  }

  static clear(resource?: SessionResource): void {
    if (!resource) {
      sessionGeneration += 1;
      entries.clear();
      dirtyResources.clear();
      resourceGenerations.clear();
      return;
    }
    for (const [key, entry] of entries) {
      if (entry.resource === resource) entries.delete(key);
    }
    resourceGenerations.set(resource, resourceGeneration(resource) + 1);
    dirtyResources.delete(resource);
  }
}
