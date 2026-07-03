import type { TranslateOptions, Translator } from './types.js';

/**
 * Failure-containment decorator: a translation is decorative, so when the inner
 * translator fails (rate limit, network, cache-store hiccup) the source text is
 * returned unchanged instead of propagating the error. Callers already treat
 * "output === input" as "nothing translated" (no `*Original` sidecars, no
 * spurious "show original"), so the degraded result stays consistent.
 *
 * Outermost in the live composition — it must also shield the cache layer.
 * Without this, one throttled DashScope call aborted an approved report's
 * finalize with "Error interno del orquestador" (live round 7).
 */
export class ResilientTranslator implements Translator {
  constructor(
    private readonly inner: Translator,
    private readonly onError?: (err: unknown) => void,
  ) {}

  async translate(text: string, opts: TranslateOptions): Promise<string> {
    try {
      return await this.inner.translate(text, opts);
    } catch (err) {
      this.onError?.(err);
      return text;
    }
  }
}
