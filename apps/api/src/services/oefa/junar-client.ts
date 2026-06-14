import { getEnv, type Env } from '../../config/env.js';

/**
 * Low-level client for the OEFA Datos Abiertos API (Junar platform).
 *
 * Endpoints (verified shapes, see oefa-api-verification.md):
 *   GET {base}/datastreams/{GUID}/data.json/?auth_key=…&limit=&offset=
 *   GET {base}/dashboards/{GUID}.json/?auth_key=…
 *
 * Resilience: per-request timeout (AbortController) + bounded retry with backoff
 * on network errors and 429/5xx. The `auth_key` is NEVER logged or included in
 * error messages — only a redacted URL is surfaced.
 *
 * Exact pagination params / field names are an open item (VERIFY B-2); the row
 * extraction here is defensive and the normalizer maps fields by alias.
 */

export interface JunarPage {
  rows: unknown[];
  count?: number;
  limit?: number;
  offset?: number;
  /** Column headers, when the envelope provides them (for array-of-arrays rows). */
  columns?: string[];
}

export class JunarError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly redactedUrl?: string,
  ) {
    super(message);
    this.name = 'JunarError';
  }
}

export interface JunarClientOptions {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = { retries: 2, backoffMs: 200, timeoutMs: 10_000 };

/** Remove the auth_key query param so URLs are safe to log / surface in errors. */
export function redactAuthKey(url: string): string {
  return url.replace(/(auth_key=)[^&]*/i, '$1***');
}

const asStringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;

/** Pull the row array out of a Junar `data.json` envelope, tolerating shapes. */
export function extractRows(json: unknown): JunarPage {
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const result = obj.result ?? obj.data ?? obj.rows;
    // Column headers, when the envelope declares them (`fields`/`columns`), let
    // the normalizer map array-of-arrays rows. We rely on explicit metadata only:
    // guessing a header from an all-strings first row is unsafe (it would drop a
    // real data row when every column happens to be a string).
    const columns = asStringArray(obj.fields) ?? asStringArray(obj.columns);
    if (Array.isArray(result)) {
      return {
        rows: result,
        columns,
        count: typeof obj.count === 'number' ? obj.count : undefined,
        limit: typeof obj.limit === 'number' ? obj.limit : undefined,
        offset: typeof obj.offset === 'number' ? obj.offset : undefined,
      };
    }
  }
  if (Array.isArray(json)) return { rows: json };
  return { rows: [] };
}

export class JunarClient {
  private readonly baseUrl: string;
  private readonly authKey: string;
  private readonly opts: Required<Omit<JunarClientOptions, 'fetchImpl' | 'sleep'>>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(env: Env = getEnv(), options: JunarClientOptions = {}) {
    if (!env.OEFA_API_KEY) {
      throw new Error('OEFA no está configurado: define OEFA_API_KEY. Ver .env.example.');
    }
    this.baseUrl = env.OEFA_API_BASE_URL.replace(/\/$/, '');
    this.authKey = env.OEFA_API_KEY;
    this.opts = {
      retries: options.retries ?? DEFAULTS.retries,
      backoffMs: options.backoffMs ?? DEFAULTS.backoffMs,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    };
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Fetch one page of a datastream's rows. */
  async getDatastreamPage(
    guid: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<JunarPage> {
    const qs = new URLSearchParams({ auth_key: this.authKey });
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const url = `${this.baseUrl}/datastreams/${encodeURIComponent(guid)}/data.json/?${qs}`;
    const json = await this.getJson(url);
    return extractRows(json);
  }

  /**
   * Fetch up to `maxRows` rows across pages. Returns `partial: true` if the cap
   * was hit before the dataset was exhausted (FR-12: partial results labeled).
   */
  async getDatastreamRows(
    guid: string,
    { pageSize = 50, maxRows = 500 }: { pageSize?: number; maxRows?: number } = {},
  ): Promise<{ rows: unknown[]; total?: number; partial: boolean; columns?: string[] }> {
    const rows: unknown[] = [];
    let offset = 0;
    let total: number | undefined;
    let columns: string[] | undefined;
    for (;;) {
      const limit = Math.min(pageSize, maxRows - rows.length);
      if (limit <= 0) return { rows, total, partial: true, columns };
      const page = await this.getDatastreamPage(guid, { limit, offset });
      if (page.count != null) total = page.count;
      if (page.columns) columns = page.columns;
      rows.push(...page.rows);
      if (page.rows.length < limit) return { rows, total, partial: false, columns }; // exhausted
      offset += page.rows.length;
      if (total != null && offset >= total) return { rows, total, partial: false, columns };
      // Cap hit: results are partial unless we provably consumed the whole set.
      // With an unknown total we must assume more rows remain (FR-12).
      if (rows.length >= maxRows) {
        return { rows, total, partial: total == null || offset < total, columns };
      }
    }
  }

  /** Fetch a dashboard descriptor (a container of views). */
  async getDashboard(guid: string): Promise<unknown> {
    const qs = new URLSearchParams({ auth_key: this.authKey });
    const url = `${this.baseUrl}/dashboards/${encodeURIComponent(guid)}.json/?${qs}`;
    return this.getJson(url);
  }

  /** GET + parse JSON with timeout and bounded retry. */
  private async getJson(url: string): Promise<unknown> {
    const redacted = redactAuthKey(url);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { signal: controller.signal });
        if (!res.ok) {
          if (this.retriable(res.status) && attempt < this.opts.retries) {
            await this.sleep(this.opts.backoffMs * 2 ** attempt);
            continue;
          }
          throw new JunarError(`OEFA respondió ${res.status}`, res.status, redacted);
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (err instanceof JunarError) throw err;
        if (attempt < this.opts.retries) {
          await this.sleep(this.opts.backoffMs * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new JunarError(
      `No se pudo consultar OEFA tras ${this.opts.retries + 1} intentos: ${stringifyError(lastErr)}`,
      undefined,
      redacted,
    );
  }

  private retriable(status: number): boolean {
    return status === 429 || status >= 500;
  }
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
