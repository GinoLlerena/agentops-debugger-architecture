import {
  NormalizedUserRequest,
  Resumption as ResumptionSchema,
  type ExecutionStatus,
  type OrchestratorState,
  type StreamEvent,
} from '@agentops/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { z, ZodError } from 'zod';
import { demoGate, unlockHandler } from './demo-gate.js';
import { deepHealth } from './health.js';
import { clientIp, rateLimit } from './rate-limit.js';
import { OEFA_DATASETS } from '../services/oefa/datasets.js';
import { RecordFilterSchema } from '../services/oefa/oefa-service.js';
import { buildSessionSnapshot } from '../orchestration/coordinator/snapshot.js';
import type { OnProgress } from '../orchestration/coordinator/types.js';
import { httpLogger, type ObsVariables } from '../observability/http-logger.js';
import { logger } from '../observability/logger.js';
import type { AppDeps } from './deps.js';

/** Hono environment carrying the per-request correlation id + child logger. */
type AppEnv = { Variables: ObsVariables };
export type AppServer = Hono<AppEnv>;

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
export function createServer(deps: AppDeps): AppServer {
  const app = new Hono<AppEnv>();

  // Correlation + access logging first, so every later handler (and onError) has a
  // request-scoped child logger and the X-Request-Id is set on the response.
  app.use('*', requestId());
  app.use('*', httpLogger());

  // Baseline security headers on every response (incl. the same-origin SPA mounted
  // later in index.ts). Defaults only — no Content-Security-Policy is set, so the
  // Vite-built SPA's inline/asset loads are unaffected.
  app.use('*', secureHeaders());

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: 'Solicitud inválida', issues: err.issues }, 400);
    // Never leak internal error detail (stack traces, driver/DB text) to the
    // client: log it server-side (correlated by requestId) and return a generic
    // message.
    (c.get('log') ?? logger).error({ err }, 'unhandled error');
    return c.json({ error: 'Error interno' }, 500);
  });

  // Optional demo-access gate (disabled unless DEMO_ACCESS_TOKEN is set). Scoped to
  // the API prefixes only — /health, /unlock, static assets and the SPA fallback
  // stay open so the unlock link loads and health checks keep working.
  const gate = demoGate(deps.env.DEMO_ACCESS_TOKEN);
  for (const prefix of ['/agent/*', '/sessions/*', '/trace/*', '/reports/*', '/rag/*', '/oefa/*']) {
    app.use(prefix, gate);
  }
  app.get('/unlock', unlockHandler(deps.env.DEMO_ACCESS_TOKEN));

  app.get('/health', (c) => c.json({ status: 'ok', mode: deps.mode }));
  // Deep health: actively pings each configured integration (manual/deploy
  // verification + observability). Left open like /health. The Qwen probe is
  // config-only unless `?llm=1`, so polling can't burn model credits.
  app.get('/health/deep', async (c) =>
    c.json(await deepHealth(deps, { llm: c.req.query('llm') === '1' })),
  );

  /**
   * Run a coordinator turn and stream it. Validation/precondition failures return
   * a normal JSON 4xx *before* streaming. Once streaming, the run is decoupled
   * from client consumption: write failures (disconnect) are swallowed so the run
   * still completes and persists, and any coordinator/persistence error is
   * surfaced as a typed `error` event. Every stream ends with a typed `done`.
   */
  const runAgent = (kind: 'start' | 'resume') => async (c: Context<AppEnv>) => {
    // Capture the originator at the boundary (the coordinator is framework-agnostic
    // and can't read the request). Only `ip` until auth lands; stamped on every
    // ledger event of the run.
    const actor = { ip: clientIp(c) };
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
      return streamTurn(c, deps, (onProgress) =>
        deps.coordinator.start(request, { onProgress, actor }),
      );
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
      deps.coordinator.resume(state, body.resumption, { onProgress, actor }),
    );
  };

  // Edge guards for the expensive endpoints: cap the request body, then apply the
  // per-IP token-bucket rate limit (disabled when RATE_LIMIT_PER_MIN is 0). Cheap
  // GET reads are intentionally left ungated.
  const guard: [MiddlewareHandler, MiddlewareHandler] = [
    bodyLimit({
      maxSize: deps.env.BODY_LIMIT_BYTES,
      onError: (c) => c.json({ error: 'La solicitud es demasiado grande.' }, 413),
    }),
    rateLimit(deps.env.RATE_LIMIT_PER_MIN),
  ];

  app.post('/agent/ask', ...guard, runAgent('start'));
  app.post('/agent/ask/resume', ...guard, runAgent('resume'));
  app.post('/agent/oefa-report', ...guard, runAgent('start'));
  app.post('/agent/oefa-report/resume', ...guard, runAgent('resume'));

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
  app.post('/rag/retrieve', ...guard, async (c) => {
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
    // Renders the file and, for approved reports, persists/serves it via the blob
    // store (OSS in live mode); see ReportExporter.
    const file = await deps.reportExporter.export(report, fmt);
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
  // Chat-shaped projection of the latest persisted state, so reopening a session
  // rehydrates the Workspace instead of starting blank (see SessionSnapshot).
  app.get('/sessions/:id/snapshot', async (c) => {
    const state = await deps.sessionStore.loadState(c.req.param('id'));
    if (!state) return c.json({ error: 'Sesión no encontrada' }, 404);
    return c.json(buildSessionSnapshot(state));
  });

  return app;
}

/** Shared SSE driver: stream progress events, persist, and always end with `done`. */
function streamTurn(
  c: Context<AppEnv>,
  deps: AppDeps,
  run: (onProgress: OnProgress) => Promise<OrchestratorState>,
) {
  const log = c.get('log') ?? logger;
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
      // Sanitize the same way as app.onError: the real error is logged server-side,
      // the SSE `error` frame carries only a stable code + generic message.
      log.error({ err }, 'orchestrator error');
      await send({
        type: 'error',
        payload: { code: 'orchestrator_error', message: 'Error interno del orquestador.' },
      });
    }

    let status: ExecutionStatus = next?.executionStatus ?? 'failed';
    let sessionId = next?.sessionId ?? 'unknown';
    if (next) {
      try {
        await deps.sessionStore.saveState(next);
      } catch (err) {
        log.error({ err }, 'persist error');
        status = 'failed';
        sessionId = next.sessionId;
        await send({
          type: 'error',
          payload: { code: 'persist_error', message: 'No se pudo guardar la sesión.' },
        });
      }
    }
    await send({ type: 'done', payload: { sessionId, status } });
  });
}
