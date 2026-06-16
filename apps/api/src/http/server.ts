import { NormalizedUserRequest, type OrchestratorState } from '@agentops/shared';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { OEFA_DATASETS } from '../services/oefa/datasets.js';
import type { OnProgress, Resumption } from '../orchestration/coordinator/types.js';
import type { AppDeps } from './deps.js';

const ResumptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approval'), approved: z.boolean() }),
  z.object({ type: z.literal('clarification'), answer: z.string() }),
]);

const OefaFilterSchema = z.object({
  administrado: z.string().optional(),
  ruc: z.string().optional(),
  sector: z.string().optional(),
  region: z.string().optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  infraction: z.string().optional(),
});

/**
 * Build the HTTP app over injected {@link AppDeps}. Dependency injection keeps the
 * server fully testable offline via `app.request(...)`. The streaming `/agent/*`
 * endpoints emit the typed event envelope (architecture §10); REST serves the
 * canvas/dashboard and the `/trace` debugger feed.
 */
export function createServer(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    return c.json({ error: err instanceof Error ? err.message : 'Error interno' }, 500);
  });

  app.get('/health', (c) => c.json({ status: 'ok', mode: deps.mode }));

  // ── streaming agent endpoints (Flow A/B share machinery) ──────────────────
  const runAgent = (kind: 'start' | 'resume') =>
    async (c: Context) => {
      let state: OrchestratorState;
      let resumption: Resumption | undefined;
      let request: NormalizedUserRequest | undefined;

      if (kind === 'start') {
        request = NormalizedUserRequest.parse(await c.req.json());
      } else {
        const body = z
          .object({ sessionId: z.string(), resumption: ResumptionSchema })
          .parse(await c.req.json());
        const loaded = await deps.sessionStore.loadState(body.sessionId);
        if (!loaded) return c.json({ error: 'Sesión no encontrada' }, 404);
        state = loaded;
        resumption = body.resumption;
      }

      return streamSSE(c, async (stream) => {
        const onProgress: OnProgress = async (event) => {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        };
        const next =
          kind === 'start'
            ? await deps.coordinator.start(request!, { onProgress })
            : await deps.coordinator.resume(state, resumption!, { onProgress });
        await deps.sessionStore.saveState(next);
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ sessionId: next.sessionId, status: next.executionStatus }),
        });
      });
    };

  app.post('/agent/ask', runAgent('start'));
  app.post('/agent/ask/resume', runAgent('resume'));
  app.post('/agent/oefa-report', runAgent('start'));
  app.post('/agent/oefa-report/resume', runAgent('resume'));

  // ── trace (AgentOps debugger feed) ────────────────────────────────────────
  app.get('/trace/:sessionId', async (c) => {
    const trace = await deps.sessionStore.getTrace(c.req.param('sessionId'));
    if (!trace) return c.json({ error: 'Sesión no encontrada' }, 404);
    return c.json({ sessionId: c.req.param('sessionId'), events: trace });
  });

  // ── OEFA REST ─────────────────────────────────────────────────────────────
  app.get('/oefa/datasets', (c) => c.json({ datasets: Object.values(OEFA_DATASETS) }));
  app.get('/oefa/datasets/:id', (c) => {
    const ds = Object.values(OEFA_DATASETS).find((d) => d.id === c.req.param('id'));
    return ds ? c.json(ds) : c.json({ error: 'Dataset no encontrado' }, 404);
  });
  app.get('/oefa/search', async (c) => {
    const filter = OefaFilterSchema.parse(c.req.query());
    return c.json(await deps.oefa.searchRecords(filter));
  });
  app.get('/oefa/company/:name', async (c) => {
    return c.json(await deps.oefa.getCompanyProfile(c.req.param('name')));
  });

  // ── RAG ─────────────────────────────────────────────────────────────────
  app.post('/rag/retrieve', async (c) => {
    const body = z
      .object({ query: z.string().min(1), limit: z.number().int().positive().max(20).optional() })
      .parse(await c.req.json());
    const results = await deps.rag.retrieve(body.query, { limit: body.limit });
    return c.json({ results });
  });

  // ── sessions ──────────────────────────────────────────────────────────────
  app.get('/sessions', async (c) => c.json({ sessions: await deps.sessionStore.listSessions() }));
  app.get('/sessions/:id', async (c) => {
    const session = await deps.sessionStore.getSession(c.req.param('id'));
    return session ? c.json(session) : c.json({ error: 'Sesión no encontrada' }, 404);
  });

  return app;
}
