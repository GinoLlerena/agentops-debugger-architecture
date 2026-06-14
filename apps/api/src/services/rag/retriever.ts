import { chunkDocument, type ChunkOptions } from './chunker.js';
import { cosineSimilarity } from './embeddings.js';
import { chunkMatchesFilter, LexicalIndex } from './lexical-index.js';
import type {
  DocChunk,
  Embedder,
  RagDocument,
  RetrievalFilter,
  RetrievalResult,
} from './types.js';

export interface RagServiceOptions {
  /** Optional Qwen embedder; absent → pure lexical retrieval (decision D4). */
  embedder?: Embedder;
  chunkOptions?: ChunkOptions;
  /** Weight of the vector score when blending hybrid results (0..1). */
  vectorWeight?: number;
}

function normalize(results: RetrievalResult[]): Map<string, number> {
  const max = results.reduce((m, r) => Math.max(m, r.score), 0);
  const out = new Map<string, number>();
  for (const r of results) out.set(r.chunk.id, max > 0 ? r.score / max : 0);
  return out;
}

/**
 * RAG service: chunk → index → retrieve. Hybrid by design — BM25 lexical always,
 * blended with vector cosine similarity when an embedder is configured (FR-06).
 * Holds the index in memory; persistence to Tablestore is wired in Phase 3.
 */
export class RagService {
  private readonly index = new LexicalIndex();
  private readonly vectorChunks: DocChunk[] = [];
  private readonly embedder?: Embedder;
  private readonly chunkOptions?: ChunkOptions;
  private readonly vectorWeight: number;

  constructor(opts: RagServiceOptions = {}) {
    this.embedder = opts.embedder;
    this.chunkOptions = opts.chunkOptions;
    this.vectorWeight = opts.vectorWeight ?? 0.5;
  }

  get size(): number {
    return this.index.size;
  }

  get mode(): 'hybrid' | 'lexical' {
    return this.embedder ? 'hybrid' : 'lexical';
  }

  async indexDocument(doc: RagDocument): Promise<DocChunk[]> {
    const chunks = chunkDocument(doc, this.chunkOptions);
    if (this.embedder && chunks.length > 0) {
      const embeddings = await this.embedder.embed(chunks.map((c) => c.text));
      chunks.forEach((c, i) => {
        c.embedding = embeddings[i];
      });
      this.vectorChunks.push(...chunks);
    }
    this.index.add(chunks);
    return chunks;
  }

  async indexDocuments(docs: RagDocument[]): Promise<DocChunk[]> {
    const all: DocChunk[] = [];
    for (const doc of docs) all.push(...(await this.indexDocument(doc)));
    return all;
  }

  async retrieve(
    query: string,
    opts: { limit?: number; filter?: RetrievalFilter } = {},
  ): Promise<RetrievalResult[]> {
    const limit = opts.limit ?? 5;
    const lexical = this.index.search(query, { limit: limit * 3, filter: opts.filter });

    if (!this.embedder || this.vectorChunks.length === 0) return lexical.slice(0, limit);

    // Hybrid: blend normalized lexical + vector cosine scores by chunk id.
    const [queryEmbedding] = await this.embedder.embed([query]);
    const vector: RetrievalResult[] = this.vectorChunks
      .filter((c) => chunkMatchesFilter(c, opts.filter) && c.embedding)
      .map((c) => ({ chunk: c, score: cosineSimilarity(queryEmbedding!, c.embedding!) }))
      .filter((r) => r.score > 0);

    const lexNorm = normalize(lexical);
    const vecNorm = normalize(vector);
    const byId = new Map<string, DocChunk>();
    for (const r of [...lexical, ...vector]) byId.set(r.chunk.id, r.chunk);

    const blended: RetrievalResult[] = [];
    for (const [id, chunk] of byId) {
      const score =
        (1 - this.vectorWeight) * (lexNorm.get(id) ?? 0) +
        this.vectorWeight * (vecNorm.get(id) ?? 0);
      blended.push({ chunk, score });
    }
    blended.sort((a, b) => b.score - a.score);
    return blended.slice(0, limit);
  }
}
