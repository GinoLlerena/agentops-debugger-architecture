import { describe, expect, it, vi } from 'vitest';
import { ResilientTranslator } from './resilient-translator.js';
import type { TranslateOptions, Translator } from './types.js';

const esToEn: TranslateOptions = { from: 'es', to: 'en' };

describe('ResilientTranslator', () => {
  it('passes through a successful translation', async () => {
    const inner: Translator = { translate: async (text) => text.toUpperCase() };
    const t = new ResilientTranslator(inner);
    expect(await t.translate('hola', esToEn)).toBe('HOLA');
  });

  it('falls back to the source text when the inner translator throws', async () => {
    const inner: Translator = {
      translate: async () => {
        throw new Error('rate limit (429)');
      },
    };
    const t = new ResilientTranslator(inner);
    expect(await t.translate('Informes de Supervisión', esToEn)).toBe(
      'Informes de Supervisión',
    );
  });

  it('reports the failure through onError', async () => {
    const boom = new Error('429');
    const inner: Translator = {
      translate: async () => {
        throw boom;
      },
    };
    const onError = vi.fn();
    await new ResilientTranslator(inner, onError).translate('hola', esToEn);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
