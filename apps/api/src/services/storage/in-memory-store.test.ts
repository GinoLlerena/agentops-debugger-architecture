import { describe, expect, it } from 'vitest';
import { COLLECTIONS, ledgerId } from './keys.js';
import { InMemoryBlobStore, InMemoryDocumentStore } from './in-memory-store.js';

describe('InMemoryDocumentStore', () => {
  it('puts, gets, and deletes by collection + id', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(COLLECTIONS.reports, 'report-1', { title: 'Informe' });
    expect(await store.get(COLLECTIONS.reports, 'report-1')).toEqual({ title: 'Informe' });
    await store.delete(COLLECTIONS.reports, 'report-1');
    expect(await store.get(COLLECTIONS.reports, 'report-1')).toBeUndefined();
  });

  it('isolates collections and clones on read (no mutation by reference)', async () => {
    const store = new InMemoryDocumentStore();
    const value = { n: 1 };
    await store.put(COLLECTIONS.sessions, 's1', value);
    value.n = 999; // mutate the original after storing
    expect(await store.get<{ n: number }>(COLLECTIONS.sessions, 's1')).toEqual({ n: 1 });
    expect(await store.get(COLLECTIONS.reports, 's1')).toBeUndefined();
  });

  it('lists by prefix in sorted id order (hierarchical ledger keys)', async () => {
    const store = new InMemoryDocumentStore();
    await store.put(COLLECTIONS.ledger, ledgerId('sB', 1), { e: 'b1' });
    await store.put(COLLECTIONS.ledger, ledgerId('sA', 2), { e: 'a2' });
    await store.put(COLLECTIONS.ledger, ledgerId('sA', 1), { e: 'a1' });

    const all = await store.list(COLLECTIONS.ledger);
    expect(all.map((d) => d.value)).toEqual([{ e: 'a1' }, { e: 'a2' }, { e: 'b1' }]);

    const onlyA = await store.list(COLLECTIONS.ledger, { prefix: 'sA:' });
    expect(onlyA.map((d) => d.value)).toEqual([{ e: 'a1' }, { e: 'a2' }]);

    expect(await store.list(COLLECTIONS.ledger, { limit: 1 })).toHaveLength(1);
  });
});

describe('InMemoryBlobStore', () => {
  it('puts, reads back, reports existence, and signs a URL', async () => {
    const blobs = new InMemoryBlobStore();
    const { key } = await blobs.put('reports/r1/informe.pdf', 'PDFBYTES', {
      contentType: 'application/pdf',
    });
    expect(key).toBe('reports/r1/informe.pdf');
    expect(await blobs.exists(key)).toBe(true);
    expect(new TextDecoder().decode(await blobs.get(key))).toBe('PDFBYTES');
    expect(await blobs.getSignedUrl(key, 60)).toContain('memory://reports/r1/informe.pdf');
    await blobs.delete(key);
    expect(await blobs.exists(key)).toBe(false);
  });

  it('throws when signing a URL for a missing blob', async () => {
    const blobs = new InMemoryBlobStore();
    await expect(blobs.getSignedUrl('missing')).rejects.toThrow();
  });
});
