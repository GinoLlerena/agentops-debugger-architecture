import type { TranslateOptions, Translator } from './types.js';

/**
 * Concurrency-capping decorator for a model-backed translator. Outbound citation
 * localization fans out per evidence item × field, so a single "approve" can fire
 * dozens of simultaneous translation calls — enough to trip DashScope's request
 * rate limit (HTTP 429 `limit_requests`, live round 7). Capping in-flight calls
 * keeps the burst under the limit while leaving the caller's fan-out shape alone.
 *
 * Wrap the {@link QwenTranslator} directly (inside {@link CachedTranslator}) so
 * cache hits never wait on a slot.
 */
export class ThrottledTranslator implements Translator {
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly inner: Translator,
    private readonly maxConcurrent = 3,
  ) {}

  async translate(text: string, opts: TranslateOptions): Promise<string> {
    if (opts.from === opts.to || !text.trim()) return text;
    await this.acquire();
    try {
      return await this.inner.translate(text, opts);
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}
