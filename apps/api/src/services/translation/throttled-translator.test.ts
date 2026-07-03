import { describe, expect, it } from 'vitest';
import { ThrottledTranslator } from './throttled-translator.js';
import type { TranslateOptions, Translator } from './types.js';

const esToEn: TranslateOptions = { from: 'es', to: 'en' };

/** A gated fake: tracks the in-flight high-water mark; resolves when released. */
function gatedTranslator() {
  let inFlight = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const inner: Translator = {
    async translate(text: string) {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => releases.push(resolve));
      inFlight--;
      return text.toUpperCase();
    },
  };
  return {
    inner,
    peak: () => peak,
    pending: () => releases.length,
    releaseAll: () => {
      // Drain iteratively: releasing a call frees a slot, which may start another.
      while (releases.length > 0) releases.shift()!();
    },
  };
}

describe('ThrottledTranslator', () => {
  it('caps in-flight inner calls at maxConcurrent, queuing the rest', async () => {
    const gate = gatedTranslator();
    const t = new ThrottledTranslator(gate.inner, 2);

    const all = Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((text) => t.translate(text, esToEn)),
    );
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    await tick(); // let the first wave start
    expect(gate.pending()).toBe(2); // only 2 running; 3 queued

    // drain waves until everything has run (a macrotask flushes the whole
    // release → next-acquire microtask chain between waves)
    while (gate.pending() > 0) {
      gate.releaseAll();
      await tick();
    }
    expect(await all).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(gate.peak()).toBe(2);
  });

  it('releases the slot when the inner translator throws (no leak)', async () => {
    let calls = 0;
    const failing: Translator = {
      async translate() {
        calls++;
        throw new Error('429');
      },
    };
    const t = new ThrottledTranslator(failing, 1);

    await expect(t.translate('a', esToEn)).rejects.toThrow('429');
    await expect(t.translate('b', esToEn)).rejects.toThrow('429'); // would hang if leaked
    expect(calls).toBe(2);
  });

  it('short-circuits same-language and empty input without taking a slot', async () => {
    const gate = gatedTranslator();
    const t = new ThrottledTranslator(gate.inner, 1);

    expect(await t.translate('hola', { from: 'es', to: 'es' })).toBe('hola');
    expect(await t.translate('   ', esToEn)).toBe('   ');
    expect(gate.pending()).toBe(0);
  });
});
