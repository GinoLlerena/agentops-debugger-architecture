import type { Translator } from './types.js';

/**
 * Offline translator — returns the source text unchanged. With no model
 * available, citations and queries stay in the canonical Spanish source; the UI
 * shows them labeled rather than fabricating a translation (documented offline
 * degradation).
 */
export class NoopTranslator implements Translator {
  async translate(text: string): Promise<string> {
    return text;
  }
}
