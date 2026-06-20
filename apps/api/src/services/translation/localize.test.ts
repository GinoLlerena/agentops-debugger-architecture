import { describe, expect, it } from 'vitest';
import type { EvidenceItem } from '@agentops/shared';
import { NoopTranslator } from './noop-translator.js';
import { localizeEvidence, translateQuery } from './localize.js';
import type { Translator } from './types.js';

/** Maps a couple of Spanish phrases to English; everything else is unchanged
 *  (so proper nouns / RUC stay verbatim, like a real glossary-aware translator). */
const fake: Translator = {
  async translate(text) {
    return text
      .replace('Resolución de multa', 'Fine resolution')
      .replace('Estado: firme', 'Status: final');
  },
};

const ev = (over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: 'OEFA:r1',
  documentTitle: 'Resolución de multa N.° 1245-2023-OEFA/DFAI',
  passage: 'Minera Las Bambas S.A. — sanción. Estado: firme.',
  confidence: 'directa',
  ...over,
});

describe('localizeEvidence', () => {
  it('is a no-op for the source language (es)', async () => {
    const items = [ev()];
    expect(await localizeEvidence(items, 'es', fake)).toBe(items);
  });

  it('translates title + passage and keeps the Spanish original as sidecars', async () => {
    const [out] = await localizeEvidence([ev()], 'en', fake);
    expect(out!.documentTitle).toContain('Fine resolution');
    expect(out!.passage).toContain('Status: final');
    expect(out!.documentTitleOriginal).toBe('Resolución de multa N.° 1245-2023-OEFA/DFAI');
    expect(out!.passageOriginal).toBe('Minera Las Bambas S.A. — sanción. Estado: firme.');
    expect(out!.originalLanguage).toBe('es');
    // proper noun / RUC code preserved verbatim by the translator
    expect(out!.documentTitle).toContain('1245-2023-OEFA/DFAI');
    expect(out!.passage).toContain('Minera Las Bambas S.A.');
  });

  it('offline (NoopTranslator) leaves citations in Spanish with no sidecars', async () => {
    const [out] = await localizeEvidence([ev()], 'en', new NoopTranslator());
    expect(out!.passage).toContain('Estado: firme');
    expect(out!.passageOriginal).toBeUndefined();
    expect(out!.originalLanguage).toBeUndefined();
  });

  it('is idempotent — an already-localized item is left untouched', async () => {
    const already = ev({ originalLanguage: 'es', passageOriginal: 'orig' });
    const [out] = await localizeEvidence([already], 'en', fake);
    expect(out).toBe(already);
  });
});

describe('translateQuery', () => {
  it('translates a non-source query into Spanish for retrieval', async () => {
    const q = await translateQuery('Estado: firme', 'en', {
      async translate() {
        return 'Estado firme ES';
      },
    });
    expect(q).toBe('Estado firme ES');
  });

  it('is a no-op for the source language and empty input', async () => {
    expect(await translateQuery('background', 'es', fake)).toBe('background');
    expect(await translateQuery('   ', 'en', fake)).toBe('   ');
  });
});
