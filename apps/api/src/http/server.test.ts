import { beforeAll, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@agentops/shared';
import { getEnv } from '../config/env.js';
import { buildDeps } from './deps.js';
import { createServer } from './server.js';

/**
 * Flow B end-to-end over the offline path (no keys, no network) — the Phase 3
 * exit criteria. Drives the real HTTP layer via `app.request()` and parses the
 * SSE stream.
 */

type Hono = ReturnType<typeof createServer>;
let app: Hono;

/** Parse an SSE response body into a list of `{ event, data }` frames. */
async function readSSE(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await res.text();
  const frames: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split('\n\n')) {
    const eventLine = block.split('\n').find((l) => l.startsWith('event:'));
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
    if (!eventLine || !dataLine) continue;
    frames.push({
      event: eventLine.slice('event:'.length).trim(),
      data: JSON.parse(dataLine.slice('data:'.length).trim()),
    });
  }
  return frames;
}

const ask = (body: unknown, path = '/agent/ask') =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  // No env → offline mode (seed records, lexical RAG, no-LLM agents).
  app = createServer(await buildDeps(getEnv({})));
});

describe('GET /health', () => {
  it('reports offline mode', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', mode: 'offline' });
  });
});

describe('Flow B — POST /agent/ask (streaming)', () => {
  it('streams plan → task → result with cited evidence (data + docs)', async () => {
    const res = await ask({
      text: 'Antecedentes del administrado con RUC 20543210981',
      sessionId: 'flow-b-1',
    });
    expect(res.status).toBe(200);
    const frames = await readSSE(res);
    const types = frames.map((f) => f.event);

    expect(types[0]).toBe('plan');
    expect(types).toContain('task_start');
    expect(types).toContain('task_done');
    expect(types).toContain('result');
    expect(types.at(-1)).toBe('done');

    const result = frames.find((f) => f.event === 'result')!.data as StreamEvent & {
      payload: { evidence: Array<{ id: string }>; text: string };
    };
    expect(result.payload.evidence.length).toBeGreaterThan(0);
    // the data agent resolved the RUC and cited OEFA records
    expect(result.payload.evidence.some((e) => e.id.startsWith('OEFA:'))).toBe(true);
    expect(result.payload.text.length).toBeGreaterThan(0);

    const done = frames.at(-1)!.data as { type: string; payload: { sessionId: string; status: string } };
    expect(done.type).toBe('done');
    expect(done.payload.sessionId).toBe('flow-b-1');
    expect(done.payload.status).toBe('completed');
  });

  it('GET /trace/:sessionId reproduces the run', async () => {
    await readSSE(
      await ask({ text: 'Antecedentes del administrado con RUC 20543210981', sessionId: 'flow-b-trace' }),
    );
    const res = await app.request('/trace/flow-b-trace');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ type: string }> };
    const eventTypes = body.events.map((e) => e.type);
    expect(eventTypes).toContain('plan_created');
    expect(eventTypes).toContain('task_routed');
    expect(eventTypes).toContain('evidence_attached');
    expect(eventTypes).toContain('task_done');
  });
});

describe('Clarification round-trip — ambiguous entity', () => {
  it('suspends on ambiguity, then completes after /resume', async () => {
    // "bambas" matches two distinct administrados in the seed → clarification.
    const first = await readSSE(await ask({ text: 'sanciones de bambas', sessionId: 'clar-1' }));
    expect(first.map((f) => f.event)).toContain('clarification_required');
    const done = first.at(-1)!.data as { payload: { status: string } };
    expect(done.payload.status).toBe('waiting');

    const resumed = await readSSE(
      await ask(
        { sessionId: 'clar-1', resumption: { type: 'clarification', answer: '20543210981' } },
        '/agent/ask/resume',
      ),
    );
    expect(resumed.map((f) => f.event)).toContain('result');
    expect((resumed.at(-1)!.data as { payload: { status: string } }).payload.status).toBe('completed');
  });

  it('returns 404 resuming an unknown session', async () => {
    const res = await ask(
      { sessionId: 'nope', resumption: { type: 'clarification', answer: 'x' } },
      '/agent/ask/resume',
    );
    expect(res.status).toBe(404);
  });

  it('rejects a resumption whose type mismatches the suspend reason (409)', async () => {
    await readSSE(await ask({ text: 'sanciones de bambas', sessionId: 'clar-mismatch' }));
    // session is waiting on a clarification; send an approval instead
    const res = await ask(
      { sessionId: 'clar-mismatch', resumption: { type: 'approval', approved: true } },
      '/agent/ask/resume',
    );
    expect(res.status).toBe(409);
  });

  it('guards re-running a waiting session (409, use /resume)', async () => {
    await readSSE(await ask({ text: 'sanciones de bambas', sessionId: 'clar-guard' }));
    const res = await ask({ text: 'otra cosa', sessionId: 'clar-guard' });
    expect(res.status).toBe(409);
  });
});

describe('input validation', () => {
  it('returns 400 (not 500) for a malformed request body', async () => {
    const res = await ask({}); // missing required `text`
    expect(res.status).toBe(400);
  });

  it('returns 400 for /rag/retrieve with limit:0', async () => {
    const res = await app.request('/rag/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'x', limit: 0 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('edge hardening', () => {
  it('sets baseline security headers on responses', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    // secureHeaders strips the framework fingerprint
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('rejects an oversized request body with 413 (before parsing)', async () => {
    const res = await ask({ text: 'a'.repeat(40_000), sessionId: 'too-big' });
    expect(res.status).toBe(413);
  });

  it('throttles per-IP once the rate limit is exceeded (429)', async () => {
    // Dedicated app with a tiny limit; offline default (0) never throttles.
    const limited = createServer(await buildDeps(getEnv({ RATE_LIMIT_PER_MIN: '1' })));
    const hit = () =>
      limited.request('/rag/retrieve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'sanciones' }),
      });
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });

  it('demo gate: blocks API routes without the cookie and unlocks via /unlock', async () => {
    const gated = createServer(await buildDeps(getEnv({ DEMO_ACCESS_TOKEN: 'sekret' })));

    // open surfaces stay reachable
    expect((await gated.request('/health')).status).toBe(200);

    // API route without the cookie → 401
    const blocked = await gated.request('/sessions');
    expect(blocked.status).toBe(401);

    // wrong token → 403, no cookie
    expect((await gated.request('/unlock?token=nope')).status).toBe(403);

    // correct token → redirect + Set-Cookie
    const unlocked = await gated.request('/unlock?token=sekret');
    expect(unlocked.status).toBe(302);
    const setCookie = unlocked.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('demo_token=');
    expect(setCookie.toLowerCase()).toContain('httponly');

    // carrying the cookie passes the gate
    const cookie = setCookie.split(';')[0]!;
    const allowed = await gated.request('/sessions', { headers: { cookie } });
    expect(allowed.status).toBe(200);
  });

  it('demo gate is disabled (open) when DEMO_ACCESS_TOKEN is unset', async () => {
    // The default offline app has no token → API routes are reachable.
    expect((await app.request('/sessions')).status).toBe(200);
  });

  it('does not leak internal error detail in the 500 body', async () => {
    // A non-Zod failure surfaces as a generic message, not the raw error text.
    const res = await app.request('/reports/%2e%2e'); // odd id; exercises the handler
    // (the store returns 404 here; the assertion that matters is no stack/message leak)
    if (res.status === 500) {
      expect(await res.json()).toEqual({ error: 'Error interno' });
    } else {
      expect(res.status).toBe(404);
    }
  });
});

describe('Flow A — report generation with HITL approval', () => {
  it('drafts a report, gates the save on approval, then persists it as approved', async () => {
    const first = await readSSE(
      await ask({ text: 'Genera un informe del administrado con RUC 20543210981', sessionId: 'flow-a-1' }),
    );
    const types = first.map((f) => f.event);
    expect(types).toContain('approval_required');
    // the approval card points at the drafted report
    const approval = first.find((f) => f.event === 'approval_required')!.data as {
      payload: { reportPreviewId?: string };
    };
    const reportId = approval.payload.reportPreviewId;
    expect(reportId).toBeTruthy();
    expect((first.at(-1)!.data as { payload: { status: string } }).payload.status).toBe('waiting');

    // the draft is retrievable and not yet approved
    const draft = (await (await app.request(`/reports/${reportId}`)).json()) as { status: string };
    expect(draft.status).toBe('draft');

    // approve → the save runs and the report becomes approved
    const resumed = await readSSE(
      await ask(
        { sessionId: 'flow-a-1', resumption: { type: 'approval', approved: true } },
        '/agent/ask/resume',
      ),
    );
    expect((resumed.at(-1)!.data as { payload: { status: string } }).payload.status).toBe('completed');
    const saved = (await (await app.request(`/reports/${reportId}`)).json()) as { status: string };
    expect(saved.status).toBe('approved');
  });

  it('exports an approved report as a downloadable PDF', async () => {
    const first = await readSSE(
      await ask({ text: 'Genera un informe del RUC 20543210981', sessionId: 'flow-a-export' }),
    );
    const reportId = (first.find((f) => f.event === 'approval_required')!.data as {
      payload: { reportPreviewId?: string };
    }).payload.reportPreviewId!;
    await readSSE(
      await ask(
        { sessionId: 'flow-a-export', resumption: { type: 'approval', approved: true } },
        '/agent/ask/resume',
      ),
    );
    const res = await app.request(`/reports/${reportId}/export/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('%PDF');
  });

  it('rejects an unsupported export format', async () => {
    const res = await app.request('/reports/whatever/export/txt');
    expect(res.status).toBe(400);
  });

  it('does not persist-approve when the user cancels (and no tab yank)', async () => {
    const first = await readSSE(
      await ask({ text: 'Genera un informe del RUC 20543210981', sessionId: 'flow-a-cancel' }),
    );
    const reportId = (first.find((f) => f.event === 'approval_required')!.data as {
      payload: { reportPreviewId?: string };
    }).payload.reportPreviewId;
    const resumed = await readSSE(
      await ask(
        { sessionId: 'flow-a-cancel', resumption: { type: 'approval', approved: false } },
        '/agent/ask/resume',
      ),
    );
    // cancelled run does not emit an open_tab uiAction
    const result = resumed.find((f) => f.event === 'result')!.data as {
      payload: { uiActions: unknown[] };
    };
    expect(result.payload.uiActions).toEqual([]);
    const report = (await (await app.request(`/reports/${reportId}`)).json()) as { status: string };
    expect(report.status).toBe('draft'); // still a draft, not approved
  });
});

describe('Session rehydrate — GET /sessions/:id/snapshot', () => {
  it('projects a completed Flow B run (question + final answer + evidence)', async () => {
    await readSSE(
      await ask({ text: 'Antecedentes del administrado con RUC 20543210981', sessionId: 'snap-done' }),
    );
    const snap = (await (await app.request('/sessions/snap-done/snapshot')).json()) as {
      status: string;
      userMessage: string;
      finalText?: string;
      evidence: unknown[];
      pending?: unknown;
    };
    expect(snap.status).toBe('completed');
    expect(snap.userMessage).toContain('20543210981');
    expect(snap.finalText && snap.finalText.length).toBeGreaterThan(0);
    expect(snap.evidence.length).toBeGreaterThan(0);
    expect(snap.pending).toBeUndefined();
  });

  it('projects a waiting clarification (the card survives a reopen)', async () => {
    await readSSE(await ask({ text: 'sanciones de bambas', sessionId: 'snap-clar' }));
    const snap = (await (await app.request('/sessions/snap-clar/snapshot')).json()) as {
      status: string;
      pending?: { type: string; request?: { question: string; candidates: unknown[] } };
    };
    expect(snap.status).toBe('waiting');
    expect(snap.pending?.type).toBe('clarification');
    expect(snap.pending?.request?.candidates.length).toBeGreaterThan(1);
  });

  it('projects a waiting approval with the drafted report id', async () => {
    const first = await readSSE(
      await ask({ text: 'Genera un informe del RUC 20543210981', sessionId: 'snap-appr' }),
    );
    const reportId = (first.find((f) => f.event === 'approval_required')!.data as {
      payload: { reportPreviewId?: string };
    }).payload.reportPreviewId;
    const snap = (await (await app.request('/sessions/snap-appr/snapshot')).json()) as {
      status: string;
      reportId?: string;
      pending?: { type: string; reportPreviewId?: string };
    };
    expect(snap.status).toBe('waiting');
    expect(snap.pending?.type).toBe('approval');
    expect(snap.pending?.reportPreviewId).toBe(reportId);
    expect(snap.reportId).toBe(reportId);
  });

  it('does not resurface the draft report after a cancelled run (suppressUi honored)', async () => {
    const first = await readSSE(
      await ask({ text: 'Genera un informe del RUC 20543210981', sessionId: 'snap-cancel' }),
    );
    expect(first.map((f) => f.event)).toContain('approval_required');
    await readSSE(
      await ask(
        { sessionId: 'snap-cancel', resumption: { type: 'approval', approved: false } },
        '/agent/ask/resume',
      ),
    );
    const snap = (await (await app.request('/sessions/snap-cancel/snapshot')).json()) as {
      status: string;
      reportId?: string;
      charts: unknown[];
      finalText?: string;
      pending?: unknown;
    };
    expect(snap.status).toBe('completed');
    expect(snap.pending).toBeUndefined();
    expect(snap.reportId).toBeUndefined(); // the hidden draft must not reappear
    expect(snap.charts).toEqual([]);
    expect(snap.finalText).toContain('cancel');
  });

  it('returns 404 for an unknown session', async () => {
    expect((await app.request('/sessions/snap-unknown/snapshot')).status).toBe(404);
  });
});

describe('REST endpoints', () => {
  it('GET /oefa/datasets lists the verified datasets', async () => {
    const body = (await (await app.request('/oefa/datasets')).json()) as { datasets: unknown[] };
    expect(body.datasets.length).toBeGreaterThanOrEqual(6);
  });

  it('GET /oefa/search filters by sector', async () => {
    const res = await app.request('/oefa/search?sector=Miner%C3%ADa');
    const body = (await res.json()) as { records: Array<{ sector?: string }> };
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.every((r) => r.sector === 'Minería')).toBe(true);
  });

  it('GET /oefa/search filters by resolution status (restored capability)', async () => {
    const res = await app.request('/oefa/search?status=firme');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: Array<{ resolutionStatus: string }> };
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.every((r) => r.resolutionStatus === 'firme')).toBe(true);
  });

  it('GET /oefa/search treats an empty year param as absent (not 0)', async () => {
    const res = await app.request('/oefa/search?yearTo=');
    const body = (await res.json()) as { records: unknown[] };
    expect(body.records.length).toBeGreaterThan(0); // would be 0 if "" coerced to year 0
  });

  it('POST /rag/retrieve returns ranked chunks', async () => {
    const res = await app.request('/rag/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'tribunal de fiscalización ambiental apelación', limit: 3 }),
    });
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('GET /sessions lists persisted sessions', async () => {
    await readSSE(await ask({ text: 'Sanciones de Refinería La Pampilla', sessionId: 'sess-list' }));
    const body = (await (await app.request('/sessions')).json()) as { sessions: Array<{ id: string }> };
    expect(body.sessions.some((s) => s.id === 'sess-list')).toBe(true);
  });
});
