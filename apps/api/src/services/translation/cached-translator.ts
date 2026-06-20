import { createHash } from 'node:crypto';
import type { DocumentStore } from '../storage/ports.js';
import { COLLECTIONS } from '../storage/keys.js';
import type { TranslateOptions, Translator } from './types.js';

interface CachedTranslation {
  from: string;
  to: string;
  text: string;
}

/**
 * Durable translation cache over the {@link DocumentStore} (Tablestore live,
 * in-memory offline). The same passage/title recurs across turns and sessions, so
 * caching turns most outbound localizations into a key lookup — no model call.
 * Cache key = direction + a content hash, so the stored text is the source of
 * truth and identical inputs always hit.
 */
export class CachedTranslator implements Translator {
  constructor(
    private readonly inner: Translator,
    private readonly store: DocumentStore,
  ) {}

  async translate(text: string, opts: TranslateOptions): Promise<string> {
    if (opts.from === opts.to || !text.trim()) return text;
    const key = cacheKey(text, opts);
    const hit = await this.store.get<CachedTranslation>(COLLECTIONS.translation, key);
    if (hit) return hit.text;
    const translated = await this.inner.translate(text, opts);
    await this.store.put<CachedTranslation>(COLLECTIONS.translation, key, {
      from: opts.from,
      to: opts.to,
      text: translated,
    });
    return translated;
  }
}

/** Deterministic cache key: `<from>:<to>:<sha256(text)>`. */
function cacheKey(text: string, { from, to }: TranslateOptions): string {
  return `${from}:${to}:${createHash('sha256').update(text).digest('hex')}`;
}
