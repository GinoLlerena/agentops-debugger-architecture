import { defineConfig } from 'vitest/config';

/**
 * Live integration smoke tests (item 8). Run with `pnpm test:integration` after
 * setting the relevant env vars; each block self-skips when its integration is
 * unconfigured. Kept out of the default suite (vitest.config.ts) so offline CI
 * and a configured local run never make surprise live/paid calls.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
