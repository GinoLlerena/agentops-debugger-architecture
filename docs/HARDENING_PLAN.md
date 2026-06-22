# Hardening Plan — Hackathon-Now Layer

Date: 2026-06-21
Scope: the cheap, high-signal hardening across six readiness topics. Sized for the
"proof, not uptime" hackathon deploy — every item is low-effort and demo-safe.
Out of scope (tracked for later): full auth, OpenTelemetry→ARMS, KMS secrets,
deploy automation, multi-tenant isolation. See "Deferred" at the end.

## Guiding constraints

- Offline mode must stay frictionless — no new required env vars, no new required services.
- All new behavior degrades gracefully when a secret/integration is absent (match the
  existing `isXConfigured()` pattern in `apps/api/src/config/env.ts`).
- The ledger stays the source of truth for "agent work"; app logs are operational only.
- Secrets are never logged. Redaction is mandatory, not best-effort.

## Priority ordering

P0 items reduce real cost/abuse exposure or unblock attribution. P1 items raise
confidence and operability. Do P0 first; each item is independently shippable.

| # | Topic | Item | Priority | Effort | Status |
|---|-------|------|----------|--------|--------|
| 1 | Security | Body-size limit + rate limit on LLM endpoints | P0 | S | ✅ done |
| 2 | Security | Security headers + error sanitization | P0 | S | ✅ done |
| 3 | Tenancy | Full-UUID sessionId + demo-token middleware | P0 | S | ✅ done |
| 4 | Observability | pino + correlation ID + redaction + HTTP logging | P0 | M | ⬜ todo |
| 5 | Observability | Emit `tool_called` + capture LLM usage into ledger | P0 | M/L | ⬜ todo |
| 6 | Observability | Add nullable `actor` to LedgerEvent (attribution-ready) | P1 | S | ⬜ todo |
| 7 | Smoke tests | Deep-health endpoint (`/health/deep`) | P1 | S | ⬜ todo |
| 8 | Smoke tests | Env-gated `pnpm test:integration` suite | P1 | M | ⬜ todo |
| 9 | Config | Boot-time config report (redacted) | P1 | S | ⬜ todo |
| 10 | CI/CD | Lint in CI + non-root container + branch protection | P1 | S | ⬜ todo |
| 11 | Streaming | Await coordinator SSE emits so `done` can't race `result` | P0 | S | ✅ done |
| 12 | Validation | `OrchestratorState.safeParse` on persisted load | P1 | S | ⬜ todo |

> **Implementation status (2026-06-22):** P0 items 1, 2, 3, 11 implemented on `main`
> (working tree), with tests (`apps/api/src/http/server.test.ts`, +6 cases) and the
> coordinator suite green; full repo typecheck + build pass. New files:
> `apps/api/src/http/rate-limit.ts`, `apps/api/src/http/demo-gate.ts`. Remaining P0:
> items 4 and 5 (the logging core). The demo gate uses the **cookie-unlock** design
> (`/unlock?token=…` → httpOnly `demo_token` cookie; gate scoped to API prefixes).

Effort: S ≈ <½ day, M ≈ ½–1 day, M/L ≈ ~1 day.

**Validated against current code (2026-06-21).** Three correctness bugs from an
earlier review were checked and are already fixed in `main` (PR #15) — locale
parsing of `1.584.000` (`apps/api/src/services/util/text.ts:51`), blank-query
rejection (`packages/shared/src/events.ts:13`), and stale canvas on direct-reply
turns. They are intentionally NOT in this plan. The two correctness items that
remain open — SSE emit ordering and untrusted persisted-state reads — are folded
in below as items 11 and 12.

---

## P0 items

### 1. Body-size limit + rate limit on expensive endpoints (Security)

**Why:** The agent + RAG endpoints call paid APIs (Qwen chat, embeddings) with no
body limit and no rate limit — direct cost/DoS exposure the moment a URL is public.

**Scope — cover ALL paid/expensive paths, not just `/agent/ask`:**
`/agent/ask`, `/agent/ask/resume`, `/agent/oefa-report`, `/agent/oefa-report/resume`
(`server.ts:81-84`), and `/rag/retrieve` (`server.ts:109`, hits embeddings in live
mode). Exclude only the cheap read/list routes; if any expensive route is excluded,
say so explicitly.

**Steps:**
- Add `hono/body-limit` middleware (e.g. 32 KB) scoped to the POST routes above in
  `apps/api/src/http/server.ts`.
- Add a lightweight in-memory rate limiter (token bucket keyed by IP) on all the
  expensive routes listed above. Keep it dependency-light; in-memory is fine for a
  single-instance demo. Make the limit env-tunable with a safe default.
- Return `413`/`429` with a typed JSON error consistent with the existing
  `ZodError` handler shape (`server.ts:35-37`).

**Files:** `apps/api/src/http/server.ts`, `apps/api/src/config/env.ts` (optional limit var).
**Verify:** unit test that an oversized body → 413 and N+1 rapid requests → 429.

### 2. Security headers + error sanitization (Security)

**Why:** No security headers today; error paths can leak internals. There are TWO
leak paths, not one: the top-level handler AND the SSE stream.

**Steps:**
- Add `hono/secure-headers` to the middleware chain in `server.ts`.
- Ensure the top-level error handler returns sanitized messages (no stack traces /
  internal paths) in `NODE_ENV=production`; keep verbose errors in development.
- **Sanitize streaming errors too:** `streamTurn` currently sends raw `err.message`
  over SSE (`server.ts:180-183`). Apply the same production sanitization there so
  orchestrator/persistence internals don't leak through the `error` stream event.

**Files:** `apps/api/src/http/server.ts`.
**Verify:** tests that a forced 500 (REST) AND a forced orchestrator throw (SSE)
both return a generic message in production mode.

### 3. Unguessable sessionId + browser-safe demo gate (Tenancy)

**Why:** Two distinct ID weaknesses (corrected from an earlier mis-citation):
- The web mints `s-${crypto.randomUUID().split('-')[0]}` — only 8 hex chars,
  guessable (`apps/web/src/lib/ids.ts:3`).
- Worse: when the API receives no `sessionId`, the coordinator's fallback `idgen`
  is the sequential, fully predictable `id-${++counter}` (`coordinator.ts:54`,
  used at `coordinator.ts:111`).
- All session/trace/report endpoints are unauthenticated.

(Note: `specialists.ts:218` / `offline-agents.ts:260` generate **report IDs**, not
session IDs — they are out of scope for this item, optional to tighten.)

**Steps:**
- Use a full unguessable ID for sessions: replace the truncation in
  `apps/web/src/lib/ids.ts:3` and the sequential fallback in the coordinator's
  default `idgen` (`coordinator.ts:54`) with full `crypto.randomUUID()`.
- Add an optional demo gate that does NOT break same-origin browser loading of the
  SPA. The API serves the built SPA on the same origin, so requiring an
  `Authorization` header on all non-`/health` routes would break asset/navigation
  requests (browsers can't attach `Authorization` to those). Instead, EITHER:
  - **(a) scope the token to API routes only** — guard `/agent/*`, `/sessions/*`,
    `/trace/*`, `/reports/*`, `/rag/*`, `/oefa/*`; leave static assets + `/health`
    open; OR
  - **(b) cookie-based gate** — a tiny login route sets an httpOnly cookie; all
    routes check it, with a static-asset/`/health` allowlist.
  - Either way: if `DEMO_ACCESS_TOKEN` is unset (offline default), allow everything
    so local mode stays frictionless.

**Files:** `apps/web/src/lib/ids.ts`, `apps/api/src/orchestration/coordinator/coordinator.ts`,
`apps/api/src/http/server.ts`, `apps/api/src/config/env.ts`, `.env.example`,
`docs/DEPLOY.md` (§10 security).
**Verify:** with token set, an API call without it → 401 while the SPA + assets +
`/health` still load; with token unset, all routes open.

### 4. pino + correlation ID + redaction + HTTP logging (Observability)

**Why:** Only 2 `console.log`s; no request logging; no correlation; no redaction.

**Steps:**
- Add `pino` with a redaction config covering all secret env keys and any
  `authorization` headers.
- Add Hono middleware that mints a `requestId` (correlation ID) per request, binds a
  child logger, and logs `method/path/status/durationMs` on completion.
- Thread `requestId` alongside `sessionId`/`runId` so app logs join the ledger trace.
- Replace the two `console.log`/`console.error` in `apps/api/src/index.ts:44-52`
  with the structured logger.

**Files:** new `apps/api/src/observability/logger.ts`,
`apps/api/src/http/server.ts`, `apps/api/src/index.ts`.
**Verify:** test that logs are JSON, include `requestId`, and never contain a secret value.

### 5. Emit `tool_called` + capture LLM usage into the ledger (Observability)

**Why:** `tool_called` is declared in the ledger enum but never emitted; LLM
token/cost/latency is uncaptured — the biggest blind spot for an *agent debugger*.

**Sizing note (M/L, not a casual M):** the coordinator does NOT observe tool
execution. Live tool calls happen inside Mastra-wrapped tools (`mastra-tool.ts:9`,
the LLM decides when to call them); offline agents call the services directly. So
there is no single point the coordinator can watch — instrumentation must live at
the tool layer and feed back to the run.

**Steps:**
- Instrument at the single chokepoint `ToolDescriptor.execute` (wrap each descriptor
  with a logging proxy) — this covers BOTH the offline path (direct calls) and the
  live path (Mastra) in one place, instead of only instrumenting `toMastraTool`.
- Thread a per-run sink/context (e.g. via a run-scoped context passed at agent
  construction, or AsyncLocalStorage) so the proxy can append `tool_called` with
  `{ tool, durationMs, resultSize }` to the active run's ledger.
- Capture DashScope `response.usage` (prompt/completion tokens) + wall-clock latency
  at the Qwen call site and record it on the ledger (extend an existing event payload
  or add a small `llm_call` event type in `packages/shared/src/ledger.ts`).
- Keep payloads secret-free (the ledger contract already forbids secrets).

**Files:** `apps/api/src/services/tools/types.ts` (`ToolDescriptor`),
`apps/api/src/orchestration/agents/mastra-tool.ts`,
`packages/shared/src/ledger.ts` (event type if added),
`apps/api/src/orchestration/agents/specialists.ts` / `planner.ts` (Qwen call sites).
**Verify:** offline test that a run with a tool call produces a `tool_called` event;
live path records `usage` when present.

---

## P1 items

### 6. Add nullable `actor` to LedgerEvent (Observability / attribution-ready)

**Why:** Audit events are anonymous. Adding the field now (empty until auth lands)
makes attribution a non-breaking fill-in later — the hinge to real auth.

**Steps:** add optional `actor?: { id?, role?, ip? }` to `LedgerEvent` in
`packages/shared/src/ledger.ts`. The coordinator is framework-agnostic and cannot
read the HTTP request directly, so capture `ip` at the **HTTP boundary** in
`server.ts` and pass it inward — either through the existing
`NormalizedUserRequest.requestContext` field (`events.ts:18`) or via `RunOptions` —
then have `ingest` read it onto the state. Leave `id`/`role` unset until auth.
**Files:** `packages/shared/src/ledger.ts`, `apps/api/src/http/server.ts`,
coordinator ingest path.
**Verify:** schema test; existing ledger consumers unaffected (field optional).

### 7. Deep-health endpoint `/health/deep` (Smoke tests / Observability)

**Why:** Doubles as deploy verification and live observability — actively pings each
configured integration instead of failing at first user request.

**Steps:** add `GET /health/deep` that, for each *configured* integration
(Tablestore, OSS, Qwen, OEFA), runs a cheap liveness check and returns per-service
`{ status, latencyMs }`; never throws, reports `skipped` for unconfigured ones.
**Files:** `apps/api/src/http/server.ts`, small per-service ping helpers.
**Verify:** offline returns all `skipped`/`ok`; one failing service → that entry
`error`, endpoint still 200 with a degraded summary.

### 8. Env-gated `pnpm test:integration` suite (Smoke tests)

**Why:** The four most likely production failures (SDK shape, creds, bucket/table
existence, model response shape) are uncovered by offline CI.

**Steps:** add `test:integration` script that runs only when required env vars are
present (skip otherwise). Cover: `createStores` Tablestore round-trip, one OSS
put/get/delete, one Qwen structured planner call, one OEFA/Junar page fetch.
**Files:** new `apps/api/src/**/*.integration.test.ts`, root + api `package.json`
scripts, `docs/DEPLOY.md` smoke section cross-link.
**Verify:** runs and skips cleanly with no creds; passes against real services when set.

### 9. Boot-time config report (Config / Observability)

**Why:** Misconfig is currently discovered at first request, not at boot.

**Steps:** at startup, log a redacted summary — mode (offline/live) and which
integrations are configured (`isQwenConfigured()` etc. from
`apps/api/src/config/env.ts`) — via the structured logger from item 4.
**Files:** `apps/api/src/index.ts`.
**Verify:** boot log lists each integration as live/offline with no secret values.

### 10. Lint in CI + non-root container + branch protection (CI/CD)

**Why:** CI skips `pnpm lint`; the Docker image runs as root; `main` has no protection.

**Steps:**
- Add a `pnpm lint` step to `.github/workflows/ci.yml`; pin action SHAs.
- Add `USER node` (non-root) to the runtime stage of `Dockerfile`; confirm the
  healthcheck and entrypoint still work as non-root.
- Enable branch protection on `main` requiring CI green (repo setting — note in plan,
  applied via GitHub UI/`gh`).

**Files:** `.github/workflows/ci.yml`, `Dockerfile`, repo settings.
**Verify:** CI fails on a lint error; container starts as `node`; PR can't merge red.

### 11. Await coordinator SSE emits so `done` can't race `result` (Streaming / P0)

**Why:** `applyResult` and `finalize` use fire-and-forget `void emit(...)` at
`coordinator.ts:266, 317, 370` for `clarification_required`, `task_done`, and the
final `result`. `streamTurn` then persists and sends `done`. Because the writes are
async, `done` can beat `result`/`task_done` under backpressure — a real demo-trust
risk (transient failed/running state or missing artifacts in the UI). This is the
one still-open correctness item from the earlier review worth doing alongside P0.

**Steps:** make `applyResult`/`finalize` async and `await emit(...)` at those three
sites so progress events are serialized before `done`. Keep `send` swallowing client
disconnects (`server.ts:166-174`) so a gone client still can't abort the run.
**Files:** `apps/api/src/orchestration/coordinator/coordinator.ts`.
**Verify:** test that a populated run emits `result` strictly before `done`.

### 12. `OrchestratorState.safeParse` on persisted load (Validation / P1)

**Why:** `Report.safeParse` is already applied on report draft reads
(`session-store.ts:95`), but `loadState` returns the stored `OrchestratorState`
untrusted. Stale/older-version/hand-edited Tablestore rows can break resume,
snapshot, or report generation.

**Steps:** parse with `OrchestratorState.safeParse` at the `loadState` read boundary;
on failure, log (structured) and treat as a fresh/absent session rather than
crashing. (Scope note: this is the read-boundary half of the broader TR finding #5;
the `record_set` artifact-payload schema is left for a later phase.)
**Files:** `apps/api/src/persistence/session-store.ts`.
**Verify:** test that a malformed stored state is rejected cleanly (no throw) and a
valid one round-trips.

---

## New env vars introduced (all optional, default-off)

| Var | Purpose | Default |
|-----|---------|---------|
| `DEMO_ACCESS_TOKEN` | Enables browser-safe demo gate when set | unset = open (offline-friendly) |
| `RATE_LIMIT_PER_MIN` | Rate limit on expensive endpoints | safe built-in default |
| `BODY_LIMIT_BYTES` | Max request body | safe built-in default |

Add all three to `.env.example` with comments; none required for offline mode.

## Suggested sequencing

1. Items 1, 2, 11 (rate/body limits, error sanitization, SSE ordering) — smallest
   correctness/abuse fixes, no schema changes.
2. Item 3 (unguessable sessionId + browser-safe gate) — sharpest public-URL risk.
3. Items 4–6 (logging + ledger instrumentation + `actor`) — the observability core
   (item 5 is the largest single piece at M/L).
4. Items 7, 8, 9, 12 (deep-health, smoke suite, config report, persisted-state
   validation) — confidence before live deploy.
5. Item 10 (CI/CD) — last, gates everything going forward.

## Deferred (next phases, not in this plan)

- Full auth (JWT/session) + `ownerId`/`tenantId` on session/report schemas + filtered `/sessions`.
- Ledger hash-chain (`prevHash→hash`) tamper-evidence + retention TTL enforcement.
- OpenTelemetry spans → Alibaba ARMS/SLS; metrics + alerting.
- KMS Secrets Manager + RAM-role credential injection; per-environment config layering.
- Deploy automation (GH Actions → ACR → ECS/Function Compute).
- Run `/security-review` on the resulting diff before any public exposure.
