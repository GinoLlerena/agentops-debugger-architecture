import { describe, expect, it } from 'vitest';
import {
  getEnv,
  isOefaConfigured,
  isOssConfigured,
  isQwenConfigured,
  isTablestoreConfigured,
} from '../config/env.js';
import { COLLECTIONS, InMemoryDocumentStore, createStores } from '../services/storage/index.js';
import { JunarRecordSource, OefaService } from '../services/oefa/oefa-service.js';
import { JunarClient } from '../services/oefa/junar-client.js';
import { DocumentStoreOefaCache } from '../services/oefa/oefa-cache.js';
import { createQwenProvider } from '../services/qwen/qwen-provider.js';
import { createQwenPlanner } from '../orchestration/agents/planner.js';

/**
 * Live integration smoke tests — the four most likely production failures that
 * offline CI cannot catch (SDK shape, credentials, bucket/table existence, model
 * response shape). Each block is gated by `skipIf` on the relevant config, so the
 * suite skips cleanly with no creds and is NOT part of the default `pnpm test`
 * (separate config: `pnpm test:integration`) — so a configured local run never
 * makes a surprise paid model call.
 */

const env = getEnv();

describe.skipIf(!isTablestoreConfigured(env))('Tablestore (live)', () => {
  it('round-trips a document: put → get → list → delete', async () => {
    const { documents } = await createStores(env);
    const id = `integration-probe-${Date.now()}`;
    const value = { hello: 'world', n: 1 };
    await documents.put(COLLECTIONS.sessions, id, value);
    expect(await documents.get(COLLECTIONS.sessions, id)).toEqual(value);
    const listed = await documents.list(COLLECTIONS.sessions, { limit: 5 });
    expect(Array.isArray(listed)).toBe(true);
    await documents.delete(COLLECTIONS.sessions, id);
    expect(await documents.get(COLLECTIONS.sessions, id)).toBeUndefined();
  });
});

describe.skipIf(!isOssConfigured(env))('OSS (live)', () => {
  it('round-trips a blob: put → exists → get → delete', async () => {
    const { blobs } = await createStores(env);
    const key = `integration/probe-${Date.now()}.txt`;
    await blobs.put(key, 'ok', { contentType: 'text/plain' });
    expect(await blobs.exists(key)).toBe(true);
    const got = await blobs.get(key);
    expect(got && Buffer.from(got).toString()).toBe('ok');
    await blobs.delete(key);
    expect(await blobs.exists(key)).toBe(false);
  });
});

describe.skipIf(!isQwenConfigured(env))('Qwen planner (live)', () => {
  it('returns a structured PlanResult', async () => {
    const planner = createQwenPlanner(createQwenProvider(env));
    const result = await planner.plan({
      request: { text: 'Antecedentes del administrado con RUC 20543210981', language: 'es', requestContext: {} },
      state: {} as never,
    });
    expect(['plan', 'clarification', 'reply']).toContain(result.kind);
  }, 30_000);
});

describe.skipIf(!isOefaConfigured(env))('OEFA Junar fetch (live)', () => {
  it('fetches and normalizes one page of records', async () => {
    const service = new OefaService(
      new JunarRecordSource(new JunarClient(env)),
      new DocumentStoreOefaCache(new InMemoryDocumentStore()),
    );
    const result = await service.getRecords(undefined, { maxRows: 5 });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0]).toHaveProperty('id');
  }, 30_000);
});
