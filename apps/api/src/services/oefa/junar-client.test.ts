import { describe, expect, it, vi } from 'vitest';
import { getEnv } from '../../config/env.js';
import { JunarClient, JunarError, redactAuthKey } from './junar-client.js';
import fixture from './__fixtures__/junar-resoluciones.json' with { type: 'json' };

const env = getEnv({ OEFA_API_KEY: 'secret-key', OEFA_API_BASE_URL: 'http://example.test/api/v2' });
const noSleep = () => Promise.resolve();

function jsonRes(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** Fake datastream of `total` object rows; honors limit/offset from the URL. */
function paginatedFetch(total: number) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const limit = Number(u.searchParams.get('limit') ?? '50');
    const offset = Number(u.searchParams.get('offset') ?? '0');
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      RUC: `200000000${offset + i}`,
      Administrado: `Empresa ${offset + i}`,
      Estado: 'Firme',
    }));
    return jsonRes({ result: rows, count: total, limit, offset });
  });
}

describe('redactAuthKey', () => {
  it('masks the auth_key but keeps the rest of the URL', () => {
    const out = redactAuthKey('http://x/api?auth_key=secret&limit=5');
    expect(out).toBe('http://x/api?auth_key=***&limit=5');
    expect(out).not.toContain('secret');
  });
});

describe('JunarClient', () => {
  it('requires an API key', () => {
    expect(() => new JunarClient(getEnv({}))).toThrow(/OEFA_API_KEY/);
  });

  it('parses a datastream page from the fixture envelope', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(fixture));
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const page = await client.getDatastreamPage('RESOL-CON-MULTA-FIRME', { limit: 50, offset: 0 });
    expect(page.rows).toHaveLength(3);
    expect(page.count).toBe(3);
  });

  it('never puts the auth_key in the request-visible error, and includes a redacted url on failure', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({}, 404));
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    await expect(client.getDatastreamPage('G')).rejects.toMatchObject({
      name: 'JunarError',
      status: 404,
    });
    try {
      await client.getDatastreamPage('G');
    } catch (e) {
      const err = e as JunarError;
      expect(err.redactedUrl).toContain('auth_key=***');
      expect(err.redactedUrl).not.toContain('secret-key');
    }
  });

  it('paginates until the dataset is exhausted', async () => {
    const fetchImpl = paginatedFetch(3);
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const { rows, total, partial } = await client.getDatastreamRows('G', { pageSize: 2 });
    expect(rows).toHaveLength(3);
    expect(total).toBe(3);
    expect(partial).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('labels results partial when the maxRows cap is hit before exhaustion', async () => {
    const fetchImpl = paginatedFetch(10);
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const { rows, partial } = await client.getDatastreamRows('G', { pageSize: 2, maxRows: 4 });
    expect(rows).toHaveLength(4);
    expect(partial).toBe(true);
  });

  it('labels results partial when the cap is hit and the API omits `count`', async () => {
    // Full pages, no `count` field → total unknown. Must assume more remain.
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      const limit = Number(u.searchParams.get('limit') ?? '50');
      const rows = Array.from({ length: limit }, (_, i) => ({ Administrado: `E${i}` }));
      return jsonRes({ result: rows }); // no count/limit/offset
    });
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const { rows, partial } = await client.getDatastreamRows('G', { pageSize: 2, maxRows: 4 });
    expect(rows).toHaveLength(4);
    expect(partial).toBe(true);
  });

  it('threads declared `fields` columns for array-of-arrays data', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({
        fields: ['RUC', 'Administrado'],
        result: [['20100110663', 'La Pampilla']],
        count: 1,
      }),
    );
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const { rows, columns } = await client.getDatastreamRows('G');
    expect(columns).toEqual(['RUC', 'Administrado']);
    expect(rows).toHaveLength(1);
  });

  it('retries on a 500 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({}, 500))
      .mockResolvedValueOnce(jsonRes(fixture));
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep });
    const page = await client.getDatastreamPage('G');
    expect(page.rows).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on persistent failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const client = new JunarClient(env, { fetchImpl, sleep: noSleep, retries: 2 });
    await expect(client.getDatastreamPage('G')).rejects.toThrow(/3 intentos/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
