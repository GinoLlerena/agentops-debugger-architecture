import { parseFrontmatter } from './frontmatter.js';
import type { DocChunk, RagDocument } from './types.js';

/** Rough token estimate (~4 chars/token) — avoids a tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ChunkOptions {
  /** Target max characters per chunk (~maxTokens * 4). */
  maxChars?: number;
  /** Overlap characters carried into the next chunk when hard-splitting. */
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = { maxChars: 1200, overlapChars: 150 };

/**
 * Paragraph-aware splitter. Packs paragraphs up to `maxChars`; a single
 * oversized paragraph is hard-split with overlap so no chunk exceeds the cap.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars, overlapChars } = { ...DEFAULTS, ...options };
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let cur = '';

  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };

  for (const para of paras) {
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars - overlapChars) {
        chunks.push(para.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (cur && cur.length + 2 + para.length > maxChars) flush();
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  flush();
  return chunks;
}

/** Chunk a document, parsing frontmatter and merging it into chunk metadata. */
export function chunkDocument(doc: RagDocument, options: ChunkOptions = {}): DocChunk[] {
  const { metadata: fm, body } = parseFrontmatter(doc.text);
  const metadata = { ...fm, ...doc.metadata }; // explicit doc.metadata wins
  return chunkText(body, options).map((text, index) => ({
    id: `${doc.id}:${index}`,
    documentId: doc.id,
    index,
    text,
    metadata,
  }));
}
