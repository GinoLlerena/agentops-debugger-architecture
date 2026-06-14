import { describe, expect, it } from 'vitest';
import {
  getEnv,
  isOefaConfigured,
  isOssConfigured,
  isQwenConfigured,
  isTablestoreConfigured,
} from './env.js';

describe('env config', () => {
  it('parses an empty environment with sane defaults (no throw at import-time)', () => {
    const env = getEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(8787);
    expect(env.QWEN_MODEL).toBe('qwen-plus');
    expect(env.DASHSCOPE_BASE_URL).toContain('dashscope');
    expect(env.OEFA_API_BASE_URL).toContain('datosabiertos.oefa.gob.pe');
  });

  it('treats empty strings as unset (blank placeholders are not configured)', () => {
    const env = getEnv({ DASHSCOPE_API_KEY: '', OEFA_API_KEY: '   ' });
    expect(isQwenConfigured(env)).toBe(false);
    // a whitespace-only value is non-empty by the cleaner, but min(1) keeps it a
    // string — still "present"; treat only "" as unset by design.
    expect(env.DASHSCOPE_API_KEY).toBeUndefined();
  });

  it('coerces PORT and rejects a malformed base URL', () => {
    expect(getEnv({ PORT: '3000' }).PORT).toBe(3000);
    expect(() => getEnv({ DASHSCOPE_BASE_URL: 'not-a-url' })).toThrow();
  });

  it('feature flags reflect presence of each credential set', () => {
    expect(isQwenConfigured(getEnv({ DASHSCOPE_API_KEY: 'sk-x' }))).toBe(true);
    expect(isOefaConfigured(getEnv({ OEFA_API_KEY: 'key' }))).toBe(true);
    expect(
      isTablestoreConfigured(
        getEnv({
          TABLESTORE_ENDPOINT: 'https://x.ots.aliyuncs.com',
          TABLESTORE_INSTANCE: 'inst',
          TABLESTORE_ACCESS_KEY_ID: 'id',
          TABLESTORE_ACCESS_KEY_SECRET: 'secret',
        }),
      ),
    ).toBe(true);
    expect(isTablestoreConfigured(getEnv({ TABLESTORE_ENDPOINT: 'https://x' }))).toBe(false);
    expect(
      isOssConfigured(
        getEnv({
          OSS_REGION: 'oss-ap-southeast-1',
          OSS_BUCKET: 'b',
          OSS_ACCESS_KEY_ID: 'id',
          OSS_ACCESS_KEY_SECRET: 'secret',
        }),
      ),
    ).toBe(true);
  });
});
