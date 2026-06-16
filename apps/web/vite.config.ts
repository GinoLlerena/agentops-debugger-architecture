import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the backend in dev (offline mode needs no keys).
    proxy: {
      '/agent': { target: 'http://localhost:8787', changeOrigin: true },
      '/oefa': { target: 'http://localhost:8787', changeOrigin: true },
      '/rag': { target: 'http://localhost:8787', changeOrigin: true },
      '/sessions': { target: 'http://localhost:8787', changeOrigin: true },
      '/reports': { target: 'http://localhost:8787', changeOrigin: true },
      '/trace': { target: 'http://localhost:8787', changeOrigin: true },
      '/health': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
