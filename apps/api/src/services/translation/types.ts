import type { Language } from '@agentops/shared';

/** Direction of a translation request. */
export interface TranslateOptions {
  from: Language;
  to: Language;
}

/**
 * Translator port — the orchestration/services depend on this interface, not on
 * any model SDK. {@link NoopTranslator} backs offline mode (returns the source
 * unchanged); {@link QwenTranslator} (wrapped in {@link CachedTranslator}) backs
 * live mode. This is the boundary that makes the pipeline canonical-Spanish while
 * presenting citations in the requested language (architecture: i18n edges).
 */
export interface Translator {
  /**
   * Translate `text` from `opts.from` to `opts.to`. Implementations MUST keep
   * proper nouns, company names (administrado) and RUC/resolution codes verbatim
   * — citations stay faithful to the legal source. A same-language or empty
   * request returns the input unchanged.
   */
  translate(text: string, opts: TranslateOptions): Promise<string>;
}
