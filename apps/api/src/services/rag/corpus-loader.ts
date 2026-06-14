import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_DOC_PATHS } from '../../data/oefa/index.js';
import type { RagDocument } from './types.js';

/** Absolute path to the seed data dir (src/data/oefa), resolved from this file. */
const SEED_DIR = fileURLToPath(new URL('../../data/oefa/', import.meta.url));

/** Document id from a relative path, e.g. "docs/resolucion-dfai-1245-2023.md" → that stem. */
function docIdFromPath(relPath: string): string {
  return relPath.replace(/^docs\//, '').replace(/\.md$/, '');
}

/**
 * Load the preloaded OEFA corpus from disk so the demo is never empty and RAG
 * works offline (architecture §8.1). Frontmatter is parsed during chunking.
 */
export async function loadSeedCorpus(): Promise<RagDocument[]> {
  const docs: RagDocument[] = [];
  for (const relPath of SEED_DOC_PATHS) {
    const text = await readFile(join(SEED_DIR, relPath), 'utf8');
    docs.push({ id: docIdFromPath(relPath), text, metadata: { source: relPath } });
  }
  return docs;
}
