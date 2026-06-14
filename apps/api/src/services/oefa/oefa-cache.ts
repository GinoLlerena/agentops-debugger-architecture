import type { OefaRecord } from '@agentops/shared';

/**
 * Cache port for OEFA query results (FR-13/FR-14). Every successful fetch is
 * cached with its timestamp; on API failure the service serves the cached copy
 * stamped "datos en caché". The Tablestore-backed implementation (Phase 1
 * storage) and an in-memory default both satisfy this interface.
 */
export interface OefaCacheEntry {
  records: OefaRecord[];
  total?: number;
  fetchedAt: string;
  coverage?: string;
}

export interface OefaCache {
  get(key: string): Promise<OefaCacheEntry | undefined>;
  set(key: string, entry: OefaCacheEntry): Promise<void>;
}

/** Build a stable cache key from a dataset id + normalized query params. */
export function cacheKey(datasetId: string, params: Record<string, unknown> = {}): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] != null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${String(params[k]).toLowerCase()}`)
    .join('&');
  return `oefa:${datasetId}${sorted ? `:${sorted}` : ''}`;
}

/** Default in-memory cache — used offline and as a fast L1 in front of Tablestore. */
export class InMemoryOefaCache implements OefaCache {
  private readonly store = new Map<string, OefaCacheEntry>();

  async get(key: string): Promise<OefaCacheEntry | undefined> {
    return this.store.get(key);
  }

  async set(key: string, entry: OefaCacheEntry): Promise<void> {
    this.store.set(key, entry);
  }
}
