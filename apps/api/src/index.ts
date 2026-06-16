/**
 * apps/api — backend entrypoint. Loads `.env`, wires the app (live integrations
 * when configured, offline equivalents otherwise), and serves the HTTP API.
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { getEnv } from './config/env.js';
import { buildDeps } from './http/deps.js';
import { createServer } from './http/server.js';

export { createServer } from './http/server.js';
export { buildDeps, type AppDeps } from './http/deps.js';

async function main(): Promise<void> {
  const env = getEnv();
  const deps = await buildDeps(env);
  const app = createServer(deps);
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(
      `AgentOps Debugger API · modo ${deps.mode} · escuchando en http://localhost:${info.port}`,
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fallo al iniciar el servidor:', err);
    process.exit(1);
  });
}
