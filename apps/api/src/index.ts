/**
 * apps/api — backend entrypoint. Loads `.env`, wires the app (live integrations
 * when configured, offline equivalents otherwise), optionally serves the built
 * web SPA same-origin, and serves the HTTP API.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import { getEnv, type Env } from './config/env.js';
import { buildDeps } from './http/deps.js';
import { createServer } from './http/server.js';

export { createServer } from './http/server.js';
export { buildDeps, type AppDeps } from './http/deps.js';

/**
 * Serve the built web SPA from the same origin as the API when {@link
 * Env.WEB_DIST_DIR} points at an existing build. The API routes are registered
 * first (in {@link createServer}), so static assets + the SPA fallback only catch
 * what the API didn't — keeping a single origin/container for front-end + back-end
 * (no CORS, no separate API base URL). A no-op in dev, where Vite serves the SPA.
 */
function mountWebApp(app: Hono, env: Env): boolean {
  const dir = env.WEB_DIST_DIR;
  if (!dir || !existsSync(dir)) return false;
  // Hashed build assets (immutable) and the favicon are read straight from disk.
  app.use('/assets/*', serveStatic({ root: dir }));
  app.use('/favicon.ico', serveStatic({ root: dir }));
  // SPA fallback: any other unmatched GET returns index.html so client-side
  // routes (e.g. /sesiones/:id) load the app instead of 404ing.
  app.get('*', serveStatic({ path: 'index.html', root: dir }));
  return true;
}

async function main(): Promise<void> {
  const env = getEnv();
  const deps = await buildDeps(env);
  const app = createServer(deps);
  const web = mountWebApp(app, env);
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    const ui = web ? ` · app web en /` : ' · solo API';
    console.log(
      `AgentOps Debugger API · modo ${deps.mode}${ui} · escuchando en http://localhost:${info.port}`,
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fallo al iniciar el servidor:', err);
    process.exit(1);
  });
}
