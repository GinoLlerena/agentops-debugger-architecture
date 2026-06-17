import { describe, expect, it } from 'vitest';
import type { OefaRecord } from '@agentops/shared';
import { cacheKey, DocumentStoreOefaCache, type OefaCacheEntry } from './oefa-cache.js';
import { InMemoryDocumentStore } from '../storage/in-memory-store.js';
import { COLLECTIONS } from '../storage/keys.js';

const entry = (n: number): OefaCacheEntry => ({
  records: [{ id: `r${n}` } as unknown as OefaRecord],
  total: n,
  fetchedAt: '2026-06-17T00:00:00.000Z',
  coverage: '2019-2025',
});

describe('cacheKey', () => {
  it('is stable regardless of param order and lower-cases values', () => {
    expect(cacheKey('ds', { ruc: '20543210981', Sector: 'Minería' })).toBe(
      cacheKey('ds', { Sector: 'minería', ruc: '20543210981' }),
    );
  });

  it('omits empty/nullish params', () => {
    expect(cacheKey('ds', { ruc: '', sector: undefined })).toBe('oefa:ds');
  });
});

describe('DocumentStoreOefaCache', () => {
  it('round-trips entries through the oefa_cache collection', async () => {
    const docs = new InMemoryDocumentStore();
    const cache = new DocumentStoreOefaCache(docs);
    const key = cacheKey('ds', { ruc: '20543210981' });

    expect(await cache.get(key)).toBeUndefined();
    await cache.set(key, entry(3));
    expect(await cache.get(key)).toEqual(entry(3));
    // stored under the documented collection
    expect(await docs.get(COLLECTIONS.oefaCache, key)).toEqual(entry(3));
  });

  it('survives a "restart": a new cache instance over the same store sees the entry', async () => {
    const docs = new InMemoryDocumentStore(); // stands in for Tablestore across restarts
    const key = cacheKey('ds');
    await new DocumentStoreOefaCache(docs).set(key, entry(1));

    // simulate a fresh process: new cache wrapper, same backing store
    expect(await new DocumentStoreOefaCache(docs).get(key)).toEqual(entry(1));
  });
});
