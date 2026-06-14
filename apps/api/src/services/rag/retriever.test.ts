import { describe, expect, it } from 'vitest';
import { loadSeedCorpus } from './corpus-loader.js';
import { RagService } from './retriever.js';

/**
 * Integration test over the real preloaded corpus (offline). Verifies the
 * lexical retriever returns the expected document for known queries and that
 * metadata filtering works — the Phase 1 RAG exit criterion.
 */
describe('RagService over the seed corpus (lexical)', () => {
  it('indexes all four seed documents', async () => {
    const rag = new RagService();
    const chunks = await rag.indexDocuments(await loadSeedCorpus());
    expect(rag.mode).toBe('lexical');
    expect(rag.size).toBeGreaterThanOrEqual(4);
    const docIds = new Set(chunks.map((c) => c.documentId));
    expect(docIds).toEqual(
      new Set([
        'resolucion-dfai-1245-2023',
        'resolucion-tfa-0456-2024',
        'informe-supervision-2023',
        'guia-transparencia-oefa',
      ]),
    );
  });

  it('ranks the TFA appeal resolution top for an appeal query', async () => {
    const rag = new RagService();
    await rag.indexDocuments(await loadSeedCorpus());
    const results = await rag.retrieve(
      'apelación ante el Tribunal de Fiscalización Ambiental recurso',
      { limit: 3 },
    );
    expect(results.length).toBeGreaterThan(0);
    const top3Types = results.map((r) => r.chunk.metadata.documentType);
    expect(top3Types).toContain('resolucion_tfa');
  });

  it('finds the supervision report for an LMP/efluentes query', async () => {
    const rag = new RagService();
    await rag.indexDocuments(await loadSeedCorpus());
    const results = await rag.retrieve('exceso de límites máximos permisibles en efluentes', {
      limit: 5,
    });
    const docIds = results.map((r) => r.chunk.documentId);
    expect(docIds.some((id) => id.includes('supervision') || id.includes('dfai'))).toBe(true);
  });

  it('filters retrieval by documentType', async () => {
    const rag = new RagService();
    await rag.indexDocuments(await loadSeedCorpus());
    const results = await rag.retrieve('infracción sanción multa medida', {
      limit: 10,
      filter: { documentType: 'guia' },
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.chunk.metadata.documentType === 'guia')).toBe(true);
  });

  it('returns nothing for a query with no lexical overlap', async () => {
    const rag = new RagService();
    await rag.indexDocuments(await loadSeedCorpus());
    expect(await rag.retrieve('zxqwk nonexistent term')).toEqual([]);
  });
});
