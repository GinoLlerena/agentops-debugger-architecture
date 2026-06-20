import type { OefaRecord } from '@agentops/shared';
import { COLLECTIONS, type DocumentStore } from '../storage/index.js';

/**
 * Cache port for OEFA query results (FR-13/FR-14). Every successful fetch is
 * cached with its timestamp; on API failure the service serves the cached copy
 * stamped "datos en caché". A {@link DocumentStore}-backed implementation
 * (Tablestore in live mode) and an in-memory default both satisfy this interface.
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

/** Default in-memory cache — used in unit tests and as a process-local fallback. */
export class InMemoryOefaCache implements OefaCache {
  private readonly store = new Map<string, OefaCacheEntry>();

  async get(key: string): Promise<OefaCacheEntry | undefined> {
    return this.store.get(key);
  }

  async set(key: string, entry: OefaCacheEntry): Promise<void> {
    this.store.set(key, entry);
  }
}

/**
 * Durable cache over a {@link DocumentStore} (FR-14): in live mode the store is
 * Tablestore, so a cached OEFA response survives process restarts and the API
 * can serve "datos en caché" after a cold start or an upstream outage. Offline
 * the same code runs over the in-memory document store, so behavior is identical
 * in tests. Entries live in the `oefa_cache` collection keyed by {@link cacheKey}.
 */
export class DocumentStoreOefaCache implements OefaCache {
  constructor(private readonly docs: DocumentStore) {}

  async get(key: string): Promise<OefaCacheEntry | undefined> {
    return this.docs.get<OefaCacheEntry>(COLLECTIONS.oefaCache, key);
  }

  async set(key: string, entry: OefaCacheEntry): Promise<void> {
    await this.docs.put(COLLECTIONS.oefaCache, key, entry);
  }
}
