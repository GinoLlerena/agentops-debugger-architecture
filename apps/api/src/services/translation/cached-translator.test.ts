import { describe, expect, it, vi } from 'vitest';
import { InMemoryDocumentStore } from '../storage/in-memory-store.js';
import { CachedTranslator } from './cached-translator.js';
import type { TranslateOptions, Translator } from './types.js';

/** A counting fake: uppercases the text so we can assert it ran (and how often). */
function fakeTranslator(): Translator & { calls: number } {
  return {
    calls: 0,
    async translate(text: string) {
      this.calls++;
      return text.toUpperCase();
    },
  };
}

const enToEs: TranslateOptions = { from: 'en', to: 'es' };

describe('CachedTranslator', () => {
  it('misses then hits — the inner translator runs once per distinct input', async () => {
    const inner = fakeTranslator();
    const t = new CachedTranslator(inner, new InMemoryDocumentStore());

    expect(await t.translate('hello', enToEs)).toBe('HELLO');
    expect(await t.translate('hello', enToEs)).toBe('HELLO'); // cache hit
    expect(inner.calls).toBe(1);
  });

  it('keys on direction — same text, different from/to is a separate entry', async () => {
    const inner = fakeTranslator();
    const t = new CachedTranslator(inner, new InMemoryDocumentStore());

    await t.translate('hello', { from: 'en', to: 'es' });
    await t.translate('hello', { from: 'es', to: 'en' });
    expect(inner.calls).toBe(2);
  });

  it('persists across instances sharing a store (durable cache)', async () => {
    const store = new InMemoryDocumentStore();
    const inner = fakeTranslator();

    await new CachedTranslator(inner, store).translate('hello', enToEs);
    const second = fakeTranslator();
    const out = await new CachedTranslator(second, store).translate('hello', enToEs);

    expect(out).toBe('HELLO');
    expect(second.calls).toBe(0); // served from the durable store
  });

  it('short-circuits same-language and empty input (no call, no store write)', async () => {
    const inner = fakeTranslator();
    const store = new InMemoryDocumentStore();
    const t = new CachedTranslator(inner, store);

    expect(await t.translate('hola', { from: 'es', to: 'es' })).toBe('hola');
    expect(await t.translate('   ', enToEs)).toBe('   ');
    expect(inner.calls).toBe(0);
    expect(await store.list('translation')).toHaveLength(0);
  });

  it('does not re-call the inner translator after a hit (spy)', async () => {
    const inner = fakeTranslator();
    const spy = vi.spyOn(inner, 'translate');
    const t = new CachedTranslator(inner, new InMemoryDocumentStore());

    await t.translate('repeat', enToEs);
    await t.translate('repeat', enToEs);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
