import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Live integration smoke tests run only via `pnpm test:integration`
    // (vitest.integration.config.ts), never in the default offline suite.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
    globals: false,
  },
});
