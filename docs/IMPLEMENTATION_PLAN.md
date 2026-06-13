# AgentOps Debugger — Implementation Plan

**Project:** Agentic application for OEFA (Peru) environmental-compliance analysis
**Plan version:** 1.0 · 13 June 2026
**Source docs:** `files/oefa_agentic_requirements.md`, `files/oefa-api-verification.md`, `files/agentops-debugger-architecture.md`, `files/agentops-debugger-ux-design.md`, `files/agentops-debugger-mockups.html`
**Target context:** Qwen Cloud / Alibaba Cloud hackathon, submission deadline **9 Jul 2026**, Track 3 (Agent Society)

---

## 0. How to use this plan

This document turns the four spec inputs into a **single executable, phased build plan**. It is the working backlog for the team. Each phase is:

- **Independently demoable** — at the end of every phase there is something that runs, so we are never "90% done with nothing to show."
- **Vertically sliced where it matters** — the hero flow (generate a cited report) is reachable in a thin form early, then thickened.
- **Mapped back to requirements** — every deliverable cites the FR/NFR/V/UX IDs it satisfies, so we can prove coverage at submission.

Priority language follows the requirements doc: **M** (Must), **S** (Should), **C** (Could). For a hackathon, the rule is: **all M for the hero + Q&A flows, selective S for demo punch, C only if time remains.**

> **Scope discipline:** This is a v1 / hackathon build. The architecture doc's deferred-to-v2 list (six-phase capability driver, per-actor visibility filtering, parallel scheduler, dedicated handoff/route engines, ownership-TTL) stays deferred. Don't gold-plate.

---

## 1. Guiding decisions (locked for v1)

These resolve the open questions in the specs so the team isn't re-deciding mid-build. Each is revisitable, but defaults are chosen to de-risk the deadline.

| # | Decision area | v1 choice | Rationale / source |
|---|---|---|---|
| D1 | Orchestration | **Mastra** workflow (Coordinator) + Mastra agents (specialists) | Architecture §5. |
| D2 | Model provider | **Qwen Cloud via DashScope** (OpenAI-compatible). `qwen-plus` for specialists; stronger reasoning model (`qwen-max`/QwQ-class) for the Coordinator **if in credits** | Arch §1.3, §7.5; mandatory hackathon constraint. |
| D3 | Persistence | **Alibaba Cloud Tablestore** (state, sessions, reports, ledger, cache, chunks, snapshots) + **OSS** (uploads, exports) | Arch §11; satisfies "runs on Alibaba Cloud" proof. |
| D4 | RAG embeddings | **Try Qwen `text-embedding-v*` first; fall back to lexical (keyword + BM25-ish) index** if not in credits. Document the path in README. | Arch §7.2; FR-06. |
| D5 | OEFA data | Live **Junar API** with verified GUIDs + **RUIAS CSV seed** preloaded so the demo never depends on live API uptime | API-verification §2–3; FR-13/14, Arch §8.1. |
| D6 | Routing | **Manifest registry** (`domain+operation → agentId`), routing is a function call, not a graph edge | Arch §5.3 — the "Agent Society" story. |
| D7 | HITL | **Single approval gate** before the only real side effect (save/export report) + clarification suspend for entity ambiguity | FR-44, Arch §4.1, §11.2. |
| D8 | Guardrail | Evidence guardrail enforced in `applyStep` (orchestration layer, not the LLM): drop/flag any finding without a backing artifact | FR-41, Arch §6, §12.4. |
| D9 | Frontend | **React + Vite + TanStack Router/Query + Tailwind + shadcn + Recharts + CopilotKit** (chat transport only) | UX doc; Arch §1.4. |
| D10 | Streaming contract | One typed event envelope `{type, payload}` powering **both** live checklist and the post-hoc trace | Arch §10, §13 (DRY). |
| D11 | Language | **es-PE first**, protected legal terms, non-editable disclaimer; English on demand is S | Reqs §7; UX §1. |
| D12 | Track framing | **Track 3 (Agent Society)**, include a single-agent baseline comparison in the demo | Arch §1.2. |

**Open items to confirm at build time** (don't block scaffolding): exact DashScope base URL + model names in credits (B-1), Junar pagination params / rate limits / HTTPS availability (B-2), whether Qwen embeddings are in credits (B-4), single-track submission rule (B-5). Track these in a `VERIFY.md` checklist.

---

## 2. Architecture at a glance (target end state)

```
apps/web (React/Vite)  ──SSE/AG-UI──▶  apps/api (Fastify/Hono)
  CopilotKit chat                         /agent/* (stream) + REST
  Canvas tabs + Recharts                  Mastra Coordinator workflow
  Trazabilidad sheet                        ingest→plan→[route→run→apply]*→finalize
  Dashboard                               Specialist agents: Data · Docs · Report · ReportManager
        ▲ TanStack Query (REST)           Tools: OEFA(Junar) · RAG · Report · Storage
                                          packages/shared: zod contracts
                                                │
                              Qwen Cloud (DashScope)  ·  Alibaba Cloud (Tablestore + OSS + FC/ECS)
```

**Monorepo (pnpm):** `apps/web`, `apps/api`, `packages/shared`.

---

## 3. Phase plan overview

| Phase | Theme | Outcome / demo at end | Maps to |
|---|---|---|---|
| **P0** | Scaffold + contracts | Monorepo builds; zod schemas + contract tests green; CI runs tests | Arch §15 P0 |
| **P1** | Backend foundations | Qwen smoke test passes; OEFA client returns normalized records from fixtures; storage + RAG retriever work offline; seed data loaded | Arch §15 P1 |
| **P2** | Orchestration core | A mocked 3-task plan drains the queue; clarification suspends; approval gate blocks; guardrail strips uncited claims — all under test | Arch §15 P2 |
| **P3** | API + persistence + thin vertical | **End-to-end Flow B (grounded Q&A)** over HTTP with streaming events and a real trace; suspend/resume durable | Arch §15 P3 |
| **P4** | Frontend workspace | **Hero Flow A** clickable: plan→checklist→result→approval, canvas tabs, evidence chips, trace sheet, dashboard | Arch §15 P4 |
| **P5** | Reports, viz, compliance, deploy | Export PDF/DOCX/XLSX with disclaimer; key charts; eval number; **deployed on Alibaba Cloud**; demo video + README | Arch §15 P5 |
| **P6** | Stretch (S/C if time) | Watchlist/vigilancia, comparison mode, map, English export, admin eval dashboard | Reqs S/C items |

Phases are sequential but **P4 frontend work can start in parallel against mocked endpoints** once P0 contracts exist — recommended given the deadline (see §11 staffing).

---

## 4. Phase 0 — Scaffold & shared contracts

**Goal:** the skeleton compiles, the type contracts that every later phase depends on exist and are tested.

### Deliverables
1. **pnpm monorepo**: `apps/web`, `apps/api`, `packages/shared`, plus `pnpm-workspace.yaml`, root `package.json`, `tsconfig` base, `eslint`/`prettier`.
2. **Repo hygiene for hackathon compliance**: `README.md` (stub), **`LICENSE` (MIT)** ← required for submission, `.gitignore`, `.gitattributes`, **`.env.example`** with placeholders only (`OEFA_API_KEY`, `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `QWEN_MODEL`, Tablestore/OSS creds), `VERIFY.md` (open items B-1…B-6).
3. **`packages/shared` zod contracts** (Arch §4.1 REUSE row, §11.1):
   - `DomainTaskPacket`, `DomainTaskResult`, `AgentManifest`, `DomainOperation`
   - `OrchestratorState`, `LedgerEvent`, `ArtifactRecord`
   - `OefaRecord`, `EvidenceItem`, `Report`, `Session`
   - The **streaming event envelope** type (`plan|task_start|task_progress|task_done|approval_required|clarification_required|result|error`)
4. **Contract tests (Vitest)**: each schema parses its fixture and rejects malformed input (Arch §8.2.1). Sets the testing discipline early and cheaply.
5. **CI**: GitHub Actions running `pnpm install && pnpm test && pnpm build` with **no network / no API key** (fixtures only).

### Key schema notes
- `OefaRecord` field set should be derived from the **RUIAS data dictionary** (administrado, RUC, unidad fiscalizable, location, subsector, hechos imputados, normativa incumplida, supervision dates, expediente, resolución directoral/multa numbers, sanction type, dictated measure, recourse type, fine amount, **reincidencia**, **firmness/status**). API-verification §2.
- `EvidenceItem` must carry `{ id, documentTitle, resolutionNumber, page, paragraph, date, sourceUrl, passage, confidence: "directa"|"inferencia"|"sin_evidencia" }` — the UI evidence chip contract (UX §4.7).
- `Report` mirrors the mandatory skeleton (Reqs §6.2): carátula, resumen ejecutivo, alcance/metodología, hallazgos (statement+evidenceIds+confidence), visualizaciones, advertencias (severity enum), recomendaciones, anexo de fuentes, disclaimer.
- Severity is an **enum with explicit criteria** (`Informativa/Advertencia/Crítica` for warnings; `Baja/Media/Alta/Crítica` for the severity scale), never color-only (FR-33, UX §6.2, accessibility).

### Exit criteria
- `pnpm test` green; `pnpm build` green in all three workspaces; CI passing on a fresh clone with no secrets.

---

## 5. Phase 1 — Backend foundations (services)

**Goal:** every external integration works in isolation, offline-testable, before any orchestration wires them together.

### 5.1 Qwen provider (`services/qwen/qwen-provider.ts`)
- Configure Mastra's model layer against DashScope (OpenAI-compatible): `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `QWEN_MODEL`.
- **Smoke test**: one completion round-trips. (FR core; this file is one of the **Alibaba/Qwen-usage proof links**.)
- Confirm base URL + model names against the live console (B-1). `qwen-plus` default; Coordinator gets the stronger model if available.

### 5.2 OEFA tools (`services/oefa/`)  — FR-10…FR-14, V-data
- **Junar client**: `GET .../datastreams/{GUID}/data.json/?auth_key=…&limit=&offset=` and the dashboard endpoint. Pagination + retry + timeout.
- **`OEFA_DATASETS`** config = the **verified GUID set** (drop-in from API-verification §3): `INFOR-ELABO`, `RESOL-CON-MULTA-FIRME` (report core), `REGIS-ACTOS-ADMIN-96376`, `MEDID-ADMIN-DE-LAS-DIREC`, `INFOR-DE-LA-DIREC-28304`, `EXPED-RESUE-15640`.
- **`oefa-normalizer.ts`**: Junar rows → `OefaRecord`, using the RUIAS data dictionary as column reference.
- **Resilience (FR-14)**: cache every response in Tablestore with fetch timestamp; on failure serve cache stamped "datos en caché del DD/MM"; queue retry. **Never log `auth_key`.**
- **Entity resolution** (Reqs §3 critical): match by RUC when available; **flag ambiguous matches** instead of guessing (feeds the clarification gate).
- **Tools exposed** (Mastra tools, typed zod I/O): `list_oefa_datasets`, `fetch_oefa_dataset`, `search_oefa_records`, `get_company_oefa_profile`.
- **Tests**: record real Junar responses **once** as fixtures, replay offline; normalizer maps fixtures → `OefaRecord`; assert pagination + cache-fallback behavior. (Arch §8.2.3)

### 5.3 Storage (`services/storage/`) — Alibaba SDK
- Tablestore client: tables for `sessions`, `reports`, `oefa_records_cache`, `doc_chunks` (+optional vectors), `ledger_events`, `workflow_snapshots`. Hierarchical keys (`report:{id}`, `session:{id}`, `ledger:{sessionId}:{seq}`).
- OSS client: uploaded docs + generated files; return signed/temporary URLs.
- This is the **second Alibaba-usage proof file** (`tablestore-client.ts` / `oss-client.ts`).

### 5.4 RAG (`services/rag/`) — FR-05, FR-06, FR-07
- `chunker.ts` (token-aware splitting) → embeddings (Qwen if available, else lexical) → store chunks+metadata in Tablestore.
- `retriever.ts`: **hybrid** vector + keyword filter by `documentType`, `source`, date range, sector, region, infraction code (FR-06).
- Tools: `retrieve_oefa_context`, `index_oefa_document`.

### 5.5 Seed data (`apps/api/src/data/oefa/`) — Arch §8.1
- Preloaded corpus: 2–3 DFAI resolutions, 1 TFA resolution, transparency guidance, project taxonomy (risk taxonomy, report template, warning levels) as Markdown.
- **RUIAS `OefaRecord` seed set** (from the CSV) so DataAgent works offline during judging.
- UIT-by-year lookup table (D7) for fine conversion UIT ⇄ S/ ⇄ USD (FR-20).

### Exit criteria
- Qwen smoke test green; OEFA tools return normalized records from fixtures with cache fallback; retriever returns expected chunks for a known query; seed data loads. **All tests pass with no network.**

---

## 6. Phase 2 — Orchestration core (the heart)

**Goal:** the Coordinator workflow + manifest routing + guardrail + suspend/resume, fully tested over a **mocked agent map** (no UI, no live LLM needed for tests).

### 6.1 Manifest registry (`mastra/manifests/`) — Arch §5.3
- `AgentManifest[]` + `resolveManifestForTask(domain, operation) → agentId`.
- `approvalPolicy: required` on `ReportManager.save`/`delete`; `none` elsewhere.
- **Routing tests**: correct agent per `domain+operation`; unknown pairs error cleanly.

### 6.2 Specialist agents (`mastra/agents/`) — Arch §6, UX §5
Each a Mastra Agent with Spanish system prompt + focused toolset:
- **DataAgent** (`Agente de Datos OEFA`) — `oefa_data`: search/explain/verify.
- **DocsAgent** (`Agente de Documentos`) — `oefa_docs`: search/explain.
- **ReportAgent** (`Agente de Informes`) — `report`: create (draft).
- **ReportManager** (`Gestor de Expedientes`) — `report_admin`: save/search/update/delete.
- (Verifier — admin/v2, behind a role flag, not in main demo path.)
- System prompts enforce L1–L3: protected legal terms, no casual synonyms, impersonal results voice, no "¡Listo! 🎉".

### 6.3 Coordinator workflow (`mastra/orchestrator/coordinator-workflow.ts`) — Arch §5.2
```
ingest → plan → branch(waiting|hasTask|else)
  taskLoop = dountil( route → run → apply , queueEmpty || !running )
  → finalize
```
- **`MAX_TASK_STEPS` guard** (e.g. 12) — runaway-loop backstop (Arch §5.2, §12.6).
- **Replace-reducer discipline**: each step returns the fully-assembled next state (Arch §11.3).
- **`applyStep` guardrail** (FR-41, D8): drop/flag any ReportAgent finding lacking a Data/Docs artifact; log a `guardrail_drop` ledger event.
- **Suspend points**: clarification (entity ambiguity → `needs_user_input`) and approval (before save/export). Persist snapshot to `workflow_snapshots` keyed by `sessionId` (Arch §11.2).
- **`onProgress(event)` seam**: emits the typed envelope for the stream.
- **Ledger**: every step appends typed `LedgerEvent`s (`plan_created`, `task_routed`, `tool_called` w/ params+duration+result-size, `evidence_attached`, `guardrail_drop`, `approval_required`, `approval_granted`, `report_saved`).

### 6.4 Error handling (Arch §12) — "errors are data, not exceptions"
Implement the eight behaviors: API down→cache+warning; ambiguous entity→suspend; no chunks→"sin evidencia"; uncited claim→guardrail; Qwen fail→1 retry then graceful fail; runaway→MAX_TASK_STEPS; bad tool input→typed tool error; persistence fail→unsaved draft + retry.

### Tests (Arch §8.2.4–5) — over mocked agents
- 3-task plan drains the queue; clarification suspends; approval gate blocks save until resume; `MAX_TASK_STEPS` halts a pathological loop; uncited claim is stripped/flagged.

### Exit criteria
- All orchestration + guardrail + routing tests green, **no live LLM required** (agents mocked). This is the Technical-Depth core.

---

## 7. Phase 3 — API, persistence & first vertical slice

**Goal:** wire orchestration to HTTP with the streaming contract, durable suspend/resume, and ship **Flow B (grounded Q&A) end-to-end** as the first real running thing.

### 7.1 Server (Fastify/Hono) — Arch §10
- **Streaming agent endpoints** (typed event envelope, D10):
  `POST /agent/ask` (Flow B), `POST /agent/oefa-report` (Flow A), `POST /agent/oefa-report/resume`, `POST /agent/search-reports`.
- **REST (TanStack Query):** `/health`, `/oefa/datasets[/:id]`, `/oefa/search`, `/oefa/company/:name`, `/documents` (upload/list/get/index/delete), `/rag/retrieve|index`, `/sessions` CRUD + `/messages`, `/reports` + `/reports/search`, **`/trace/:sessionId`** (the AgentOps debugger feed).
- CopilotKit attaches to `/agent/*` as **chat transport only**, not a decision-maker (Arch §10).
- `DELETE` endpoints exist but are gated behind UI confirmation (HITL rule).

### 7.2 Suspend/resume durability — Arch §11.2
- On `suspend()`, serialize `OrchestratorState` + resume token to `workflow_snapshots`. `/resume` loads it, applies the user's approval/answer, continues. **Durable across HTTP requests** (an in-memory-only checkpoint would not survive a process restart).

### 7.3 Vertical slice: Flow B working
- `POST /agent/ask` with a real Qwen call + DataAgent/DocsAgent over seed data returns a **cited answer** with streamed `plan→task→result` events and a populated `/trace/:sessionId`.

### Exit criteria
- `curl`/test client drives Flow B: streamed events arrive in order, answer carries evidence, trace reproduces the run, a clarification round-trips through `/resume`. **First genuinely runnable product.**

---

## 8. Phase 4 — Frontend workspace (the product face)

**Goal:** the hero experience is clickable end-to-end. UX doc §4–11 is the visual contract; the mockups HTML is the pixel reference (palette, type, expediente tabs, chips).

### 8.1 App shell & routing (UX §3)
- Vite + TanStack Router/Query + Tailwind + shadcn. Routes: `/` (Panel), `/sesiones`, `/sesiones/:id` (Workspace ★), `/oefa`, `/oefa/empresa/:nombre`, `/documentos`, `/informes/:id`.
- `AppShell` (nav rail 64/240px, top bar), navigation toast when the agent navigates ("El agente abrió el Informe #042").
- **Design tokens** from mockups: palette (`verde-fiscal #0E5A47`, `azul-dato #1D6FA3`, `ámbar #B45309`, `rojo #B42318`, `gris-ev #5B6661`, `papel #F7F8F6`), fonts (Archivo / Source Sans 3 / IBM Plex Mono), radii (6/4/2), 150–250ms motion, `prefers-reduced-motion`.

### 8.2 Workspace: chat + canvas (UX §4) — the 80% screen
- **Chat column** (400–460px): `ChatThread` + 7 message components — `PlanCard` (4.4), `TaskChecklist` w/ live captions (4.5), `ResultSummaryCard` (4.6), `ApprovalCard` (HITL, 4.3), `ClarificationCard` (candidate cards), `SystemNotice` (amber, non-modal), user bubble.
- **Canvas** (tabs as expediente file-tabs): Resumen / Datos OEFA / Documentos / Informe (UX §6.1).
- **Evidence chips** `[E1]` (UX §4.7): hover popover, click→`EvidenceDrawer` (Sheet) with passage + "Abrir documento original (p. N)". Confidence encoded by border (solid/dashed) **and** label; missing source → visible gray "sin fuente" chip.
- **Agent attribution chip** on every canvas artifact → opens its trace slice (UX §4.2).
- **Stream binding**: render all chat cards from the typed event envelope (the same one driving the trace). Auto-switch canvas tab ≤1× per task, never while user scrolls.

### 8.3 Trazabilidad sheet (AgentOps debugger) — UX §7
- Side sheet (560px) over canvas; vertical spine = plan steps; expand → tool-call cards (name, humanized params, duration, result size, evidence). **"Verificación" section** showing guardrail outcome (claims checked/flagged/removed). Titled **"Trazabilidad"** in analyst mode. Sourced from `/trace/:sessionId`.

### 8.4 Dashboard (`/`) — UX §6.3, V9
- KPI cards (procesos abiertos, nuevas resoluciones/mes, exposición UIT, alertas activas), `AlertFeed` ("Investigar →" seeds a session), `SessionsTable`, global search, "Nueva investigación" primary CTA with 3 suggested prompts.

### 8.5 Accessibility floor (UX §10)
- WCAG 2.1 AA contrast; severity never color-only; full keyboard path; `aria-live="polite"` on checklist; charts paired with "Ver tabla" toggle (doubles as CSV); targets ≥40px; Esc-dismissable popovers; focus-trapped drawer.

### Exit criteria
- **Hero Flow A clickable**: type a request → Plan card → live checklist → Result card → Approval card → approve → Informe tab finalizes; evidence chips work; trace sheet reproduces the run; dashboard renders.

---

## 9. Phase 5 — Reports, visualizations, compliance & deploy

**Goal:** the deliverables that win judging (exports, charts, transparency metric) and satisfy **all mandatory hackathon constraints**.

### 9.1 Report export (`services/report/` + tools) — FR-30…FR-34, Reqs §6
- `build_report` assembles structured `Report`; export to **PDF + DOCX** (FR-31), data tables to **XLSX/CSV**, charts embedded as images. Store in OSS, return signed URLs.
- **Mandatory skeleton** (Reqs §6.2) + **"Fuentes y metodología" annex** (FR-32: documents, API queries, consultation dates, agent version) + **non-editable bilingual disclaimer** (FR-34, Arch §14).
- Presentation rules (Reqs §6.3): UIT **and** Soles with UIT-year, resolution citation format applied automatically, DD/MM/AAAA dates, footer with page/version/timestamp.
- Report draft **editable before export** (FR-35, S) if time.

### 9.2 Visualizations (Recharts) — Reqs §5, UX §6.2
Priority order for the demo:
1. **C1 Timeline procesal (V1)** — the hero visual, most valued by persona. Custom horizontal, dots by outcome, popover w/ date+document+evidence chip.
2. **C2 Sanciones por año (V2)**, **C5 Distribución de severidad (V6, segmented bar not pie)**, **C6 Evolución de supervisiones (V3)** — dashboard + report.
3. If time: **C3** infraction-type bars, **C4** region small-multiples, **C7** funnel (V7), **C8** risk matrix (V6, transparent formula link).
- Global chart rules: title = the question, unit label, "Datos al DD/MM/AAAA" + dataset-coverage stamp (`API OEFA · RESOL-CON-MULTA-FIRME · cobertura 2019–2025 · consultado 13/06/2026`), attribution chip, PNG+CSV export, color-blind-safe, empty-state copy.

### 9.3 Evaluation (high-value, optional) — FR-46, NFR-01, Arch §13
- Verifier runs a golden set of Q→expected-evidence pairs; surface **one number** ("citation precision 96% on 20 cases") in the demo — directly answers the track's "measurable" ask.

### 9.4 Hackathon compliance checklist (Arch §14 — all must be true)
- [ ] Qwen models on Qwen Cloud as core provider — link `qwen-provider.ts`.
- [ ] **Backend deployed on Alibaba Cloud** (Function Compute or ECS) — record proof video; link `tablestore-client.ts`/`oss-client.ts`.
- [ ] Public GitHub repo with detectable **OSS license** (MIT).
- [ ] **Architecture diagram** rendered (the §1.4 / §2 diagram).
- [ ] **~3-min demo video** (public) + text description + **named Track 3**.
- [ ] README: problem, solution, stack, setup, env, deploy, RAG flow, demo script, disclaimer.
- [ ] Confirm B-1 (DashScope URL/models) and B-5 (single-track rule) before submission.
- [ ] Optional blog post (Blog Post Award).

### Exit criteria (Definition of Done, Arch §15 + Reqs §10)
Search an entity → real OEFA endpoint w/ key → Qwen call → preloaded/uploaded docs → retrieve context → generate structured report → HITL approve → save → reopen via sessions/reports → dashboard chart renders → **trace view reproduces the run** → **deployed on Alibaba Cloud with proof**.

---

## 10. Phase 6 — Stretch (only if time remains)

S/C requirements deferred unless ahead of schedule:
- **Watchlist / vigilancia** (FR-15, S) + alert firing on new resolution (acceptance criterion #5) — high demo value if the dashboard alert feed is already built.
- **Comparison mode** 2–5 entities (FR-24, V8 sparklines, S).
- **Geographic map of Peru** (V4) — heavy; C.
- **Heatmap infraction×sector** (V5), **risk scoring** (FR-23 transparent formula, S), **deadline calculator** (FR-25, C).
- **English report export** (L4/FR — S), **glossary tooltips** (L5).
- **Admin evaluation dashboard** (FR-46), feedback loop (FR-45).
- v2 plugins: other regulators (ANA, SENACE, MINEM, OSINERGMIN), environmental-sampling datastreams.

---

## 11. Execution strategy (deadline 9 Jul)

### Parallelization (recommended given ~4 weeks)
- **Track A (backend):** P0 contracts → P1 services → P2 orchestration → P3 API. Critical path.
- **Track B (frontend):** starts after P0 contracts land, builds against **mocked endpoints emitting the typed envelope**, converges with backend at P3/P4.
- **Track C (data/content + deploy):** seed corpus, RUIAS CSV, UIT table, golden eval set, Alibaba Cloud account/Tablestore/OSS provisioning, deploy pipeline — runs alongside throughout.

### Suggested milestone calendar (adjust to actual start)
| Week | Milestone |
|---|---|
| W1 | P0 done; P1 services offline-green; Alibaba/Qwen accounts provisioned; mockup tokens extracted |
| W2 | P2 orchestration tests green; P3 Flow B live end-to-end; frontend shell + chat cards on mocks |
| W3 | P4 hero Flow A clickable on real backend; timeline + key charts; trace sheet |
| W4 | P5 exports + compliance; deploy to Alibaba Cloud; eval number; **record demo video + README + diagram**; buffer for VERIFY items |

> **Reserve the last 3–4 days purely for submission artifacts** (deploy proof, video, README, diagram). These sink hackathons more often than code does.

### What to cut first if behind
1. Stretch P6 entirely.
2. Charts beyond C1/C2/C5/C6.
3. Qwen embeddings → lexical RAG fallback (already the documented escape hatch, D4).
4. DOCX export (keep PDF) — but keep the disclaimer + sources annex regardless.
Never cut: evidence guardrail, the trace, the disclaimer, the Alibaba-Cloud deploy proof — they are the identity of the project and the submission requirements.

---

## 12. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| OEFA Junar API down / rate-limited during judging | Demo breaks | RUIAS CSV seed + Tablestore cache fallback (D5, FR-14); demo can run fully offline |
| DashScope base URL / model names differ from spec | Backend won't call model | Verify B-1 in W1; isolate in `qwen-provider.ts`; `qwen-plus` safe default |
| Qwen embeddings not in credits | RAG path unclear | Lexical fallback already planned (D4); decide in W1, note in README |
| No Mastra Tablestore storage adapter | Suspend/resume blocked | Implement snapshot persistence ourselves in `session-store` (Arch §11.2, B-6 assumes this) |
| Hallucination / uncited claims | Fails NFR-01, kills trust | Guardrail in `applyStep` at orchestration layer (D8) + golden-set citation-precision check |
| Alibaba Cloud deploy friction | Misses mandatory constraint | Provision in W1, deploy a "hello" early to ECS/FC, don't leave deploy to the last day |
| Scope creep into deferred v2 patterns | Burns the deadline | §1 scope discipline; the "defer to v2" list is binding |
| Frontend/backend contract drift | Integration pain at P3/P4 | Single source of truth: `packages/shared` + the one event envelope (D10); frontend mocks emit the same types |

---

## 13. Requirements coverage map (traceability)

| Requirement group | Where delivered |
|---|---|
| FR-01…FR-08 (RAG Q&A, citations, status, upload, hybrid search, summary) | P1 RAG, P2 DocsAgent, P3 Flow B, P4 chips/drawer |
| FR-10…FR-15 (OEFA API tool use, pagination, cache, degrade, watchlist) | P1 OEFA tools, P2 DataAgent, P6 watchlist (S) |
| FR-20…FR-25 (aggregation, trends, precedent, risk, comparison, deadlines) | P5 charts + UIT table; P6 risk/comparison/deadlines (S/C) |
| FR-30…FR-36 (report gen, export, sources annex, severity, recommendations, branding) | P5 report export; FR-36 branding C |
| FR-40…FR-46 (trace, guardrail, confidence, audit log, HITL, feedback, eval) | P2 guardrail+ledger, P3 `/trace`, P4 trace sheet, P5 eval; FR-45/46 P6 |
| V1…V9 (visualizations) | P5 (C1/C2/C5/C6 core), P6 (map/heatmap/funnel/sparklines) |
| L1…L6 (Spanish-first, legal terms, glossary) | P2 prompts, P4 UI copy; glossary P6 |
| NFR-01…NFR-10 | NFR-01 P5 eval; NFR-02 ledger; NFR-03 cache freshness P1; NFR-04 perf budgets; NFR-05/06 §14 security/privacy; NFR-08 onboarding P4; NFR-09 versioning in reports P5 |
| Acceptance criteria #1–5 (Reqs §10) | #1–3 by P4; #4 P5 guardrail+eval; #5 P6 watchlist |

---

## 14. Immediate next actions (to start P0)

1. Confirm with stakeholder: **Track 3 framing**, MIT license, and that this plan's v1 scope is approved.
2. Provision Alibaba Cloud (Tablestore + OSS + FC/ECS) and request the **OEFA API key** (Junar developer page) and **DashScope key** — long-lead items.
3. Scaffold the pnpm monorepo + `packages/shared` zod contracts + contract tests + CI (Phase 0).
4. Kick off `VERIFY.md` and resolve B-1 (DashScope URL/models) and B-4 (embeddings in credits) in week 1.

---

*End of implementation plan.*
