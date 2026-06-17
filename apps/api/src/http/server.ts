import {
  NormalizedUserRequest,
  Resumption as ResumptionSchema,
  type ExecutionStatus,
  type OrchestratorState,
  type StreamEvent,
} from '@agentops/shared';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z, ZodError } from 'zod';
import { OEFA_DATASETS } from '../services/oefa/datasets.js';
import { RecordFilterSchema } from '../services/oefa/oefa-service.js';
import { exportReport } from '../services/report/export-report.js';
import type { OnProgress } from '../orchestration/coordinator/types.js';
import type { AppDeps } from './deps.js';

/** Query-string year params arrive as strings; treat present-but-empty as absent. */
const QueryYear = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().int().optional(),
);

/** Reuse the shared filter contract; only override the year fields for coercion. */
const OefaSearchSchema = RecordFilterSchema.extend({ yearFrom: QueryYear, yearTo: QueryYear });

/**
 * Build the HTTP app over injected {@link AppDeps}. Dependency injection keeps the
 * server fully testable offline via `app.request(...)`. The streaming `/agent/*`
 * endpoints emit the typed event envelope (architecture §10), always terminating
 * with a typed `done` frame; REST serves the canvas/dashboard and `/trace`.
 */
export function createServer(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: 'Solicitud inválida', issues: err.issues }, 400);
    return c.json({ error: err instanceof Error ? err.message : 'Error interno' }, 500);
  });

  app.get('/health', (c) => c.json({ status: 'ok', mode: deps.mode }));

  /**
   * Run a coordinator turn and stream it. Validation/precondition failures return
   * a normal JSON 4xx *before* streaming. Once streaming, the run is decoupled
   * from client consumption: write failures (disconnect) are swallowed so the run
   * still completes and persists, and any coordinator/persistence error is
   * surfaced as a typed `error` event. Every stream ends with a typed `done`.
   */
  const runAgent = (kind: 'start' | 'resume') => async (c: Context) => {
    if (kind === 'start') {
      const request = NormalizedUserRequest.parse(await c.req.json());
      if (request.sessionId) {
        const existing = await deps.sessionStore.loadState(request.sessionId);
        if (existing?.executionStatus === 'waiting') {
          return c.json(
            { error: 'La sesión está en espera de tu respuesta. Usa /agent/*/resume.' },
            409,
          );
        }
      }
      return streamTurn(c, deps, (onProgress) => deps.coordinator.start(request, { onProgress }));
    }

    const body = z
      .object({ sessionId: z.string(), resumption: ResumptionSchema })
      .parse(await c.req.json());
    const state = await deps.sessionStore.loadState(body.sessionId);
    if (!state) return c.json({ error: 'Sesión no encontrada' }, 404);
    const interrupt = state.interruptState;
    if (interrupt && interrupt.reason !== body.resumption.type) {
      return c.json(
        { error: `La sesión espera una respuesta de "${interrupt.reason}".` },
        409,
      );
    }
    return streamTurn(c, deps, (onProgress) =>
      deps.coordinator.resume(state, body.resumption, { onProgress }),
    );
  };

  app.post('/agent/ask', runAgent('start'));
  app.post('/agent/ask/resume', runAgent('resume'));
  app.post('/agent/oefa-report', runAgent('start'));
  app.post('/agent/oefa-report/resume', runAgent('resume'));

  // ── trace (AgentOps debugger feed) ────────────────────────────────────────
  app.get('/trace/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    const trace = await deps.sessionStore.getTrace(sessionId);
    if (!trace) return c.json({ error: 'Sesión no encontrada' }, 404);
    return c.json({ sessionId, events: trace });
  });

  // ── OEFA REST ─────────────────────────────────────────────────────────────
  app.get('/oefa/datasets', (c) => c.json({ datasets: Object.values(OEFA_DATASETS) }));
  app.get('/oefa/datasets/:id', (c) => {
    const ds = Object.values(OEFA_DATASETS).find((d) => d.id === c.req.param('id'));
    return ds ? c.json(ds) : c.json({ error: 'Dataset no encontrado' }, 404);
  });
  app.get('/oefa/search', async (c) => {
    const filter = OefaSearchSchema.parse(c.req.query());
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

  // ── reports ──────────────────────────────────────────────────────────────
  app.get('/reports', async (c) => c.json({ reports: await deps.reportStore.list() }));
  app.get('/reports/:id', async (c) => {
    const report = await deps.reportStore.get(c.req.param('id'));
    return report ? c.json(report) : c.json({ error: 'Informe no encontrado' }, 404);
  });
  app.get('/reports/:id/export/:fmt', async (c) => {
    const fmt = c.req.param('fmt');
    if (fmt !== 'pdf' && fmt !== 'docx' && fmt !== 'xlsx') {
      return c.json({ error: 'Formato no soportado' }, 400);
    }
    const report = await deps.reportStore.get(c.req.param('id'));
    if (!report) return c.json({ error: 'Informe no encontrado' }, 404);
    const file = await exportReport(report, fmt);
    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
      },
    });
  });

  // ── sessions ──────────────────────────────────────────────────────────────
  app.get('/sessions', async (c) => c.json({ sessions: await deps.sessionStore.listSessions() }));
  app.get('/sessions/:id', async (c) => {
    const session = await deps.sessionStore.getSession(c.req.param('id'));
    return session ? c.json(session) : c.json({ error: 'Sesión no encontrada' }, 404);
  });

  return app;
}

/** Shared SSE driver: stream progress events, persist, and always end with `done`. */
function streamTurn(
  c: Context,
  deps: AppDeps,
  run: (onProgress: OnProgress) => Promise<OrchestratorState>,
) {
  return streamSSE(c, async (stream) => {
    const send = async (event: StreamEvent) => {
      // Swallow write errors: a disconnected client must not abort the run, so
      // the resulting state still gets persisted (durable suspend/resume).
      try {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      } catch {
        /* client gone */
      }
    };

    let next: OrchestratorState | undefined;
    try {
      next = await run(send);
    } catch (err) {
      await send({
        type: 'error',
        payload: { code: 'orchestrator_error', message: err instanceof Error ? err.message : String(err) },
      });
    }

    let status: ExecutionStatus = next?.executionStatus ?? 'failed';
    let sessionId = next?.sessionId ?? 'unknown';
    if (next) {
      try {
        await deps.sessionStore.saveState(next);
      } catch (err) {
        status = 'failed';
        sessionId = next.sessionId;
        await send({
          type: 'error',
          payload: { code: 'persist_error', message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    await send({ type: 'done', payload: { sessionId, status } });
  });
}
