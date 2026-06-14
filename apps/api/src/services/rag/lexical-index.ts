import type { DocChunk, RetrievalFilter, RetrievalResult } from './types.js';

/** Small Spanish stopword set — enough to keep BM25 scores meaningful. */
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o',
  'que', 'con', 'por', 'para', 'su', 'sus', 'se', 'es', 'son', 'fue', 'ha', 'han', 'lo', 'le',
  'como', 'mas', 'pero', 'sus', 'este', 'esta', 'estos', 'estas', 'the', 'of', 'and', 'to', 'in',
]);

export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function chunkMatchesFilter(chunk: DocChunk, filter?: RetrievalFilter): boolean {
  if (!filter) return true;
  if (filter.documentType && chunk.metadata.documentType !== filter.documentType) return false;
  if (filter.source && chunk.metadata.source !== filter.source) return false;
  if (
    filter.administrado &&
    !String(chunk.metadata.administrado ?? '')
      .toLowerCase()
      .includes(filter.administrado.toLowerCase())
  )
    return false;
  return true;
}

/**
 * In-memory BM25 lexical index — the default (and offline) retrieval path
 * (decision D4). Hybrid blending with vector similarity is layered on top in the
 * RagService when a Qwen embedder is available.
 */
export class LexicalIndex {
  private readonly chunks: DocChunk[] = [];
  private readonly termFreqs: Array<Map<string, number>> = [];
  private readonly docFreq = new Map<string, number>();
  private readonly lengths: number[] = [];
  private avgLen = 0;

  private static readonly K1 = 1.5;
  private static readonly B = 0.75;

  add(chunks: DocChunk[]): void {
    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const term of tf.keys()) this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      this.chunks.push(chunk);
      this.termFreqs.push(tf);
      this.lengths.push(tokens.length);
    }
    const total = this.lengths.reduce((a, b) => a + b, 0);
    this.avgLen = this.chunks.length ? total / this.chunks.length : 0;
  }

  get size(): number {
    return this.chunks.length;
  }

  search(query: string, opts: { limit?: number; filter?: RetrievalFilter } = {}): RetrievalResult[] {
    const limit = opts.limit ?? 5;
    const qTerms = [...new Set(tokenize(query))];
    const N = this.chunks.length;
    if (N === 0 || qTerms.length === 0) return [];

    const scored: RetrievalResult[] = [];
    for (let i = 0; i < N; i++) {
      const chunk = this.chunks[i]!;
      if (!chunkMatchesFilter(chunk, opts.filter)) continue;
      const tf = this.termFreqs[i]!;
      const len = this.lengths[i]!;
      let score = 0;
      for (const term of qTerms) {
        const f = tf.get(term);
        if (!f) continue;
        const df = this.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const denom = f + LexicalIndex.K1 * (1 - LexicalIndex.B + (LexicalIndex.B * len) / (this.avgLen || 1));
        score += idf * ((f * (LexicalIndex.K1 + 1)) / denom);
      }
      if (score > 0) scored.push({ chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
