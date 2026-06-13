# AgentOps Debugger — System Architecture & Implementation Guide
## A Mastra-based agentic system for OEFA environmental compliance

**Version:** 1.0 · 13 June 2026
**Audience:** Claude Code (implementation), backend/frontend engineers, hackathon reviewers
**Target:** Qwen Cloud / Alibaba Cloud Hackathon (deadline 9 Jul 2026)
**Companion docs:** `agentops-debugger-ux-design.md` (UI), `oefa-api-verification.md` (verified dataset GUIDs), `oefa_agentic_requirements.md` (requirements)

---

## 0. How to read this document

This document ties together the requirements (what to build), the UX design (how it looks), and the OEFA data verification (what data is real), and specifies how to assemble them into one Mastra application.

The architecture is **hackathon-realistic** by design. It commits to a disciplined core — typed contracts, structured durable state, manifest-driven routing, an append-only audit ledger, and approval gates — while deliberately keeping scope small: a single bounded orchestration loop rather than a large compiled graph, sequential task execution rather than a parallel scheduler, and a single approval gate rather than a full capability-lifecycle driver. The heavier machinery is called out as **v2 extension points** throughout, so the v1 build stays focused.

---

## 1. System Overview

### 1.1 What we are building

An agentic web application where a Peruvian environmental compliance analyst asks questions in natural language and receives **evidence-based reports, warnings, and recommendations** about administrados (regulated entities) supervised by OEFA. The agent combines OEFA public open-data (via the Junar API) with uploaded/preloaded regulatory documents (via RAG), and shows its work through a transparent trace — the "AgentOps Debugger" angle.

### 1.2 Hackathon track positioning (ASSUMPTION — verify)

The hackathon has five tracks. This solution fits two; the team must pick one for submission framing:

- **Track 3 — Agent Society** (recommended primary): a multi-agent system where a Coordinator decomposes a compliance question and specialist agents (Data, Documents, Report) collaborate. The track explicitly rewards "how agents decompose tasks and assign roles" and "measurable efficiency gain over single-agent baselines." *Our manifest-driven orchestration and the multi-agent plan are a direct fit; we should include a single-agent baseline comparison in the demo.*
- **Track 4 — Autopilot Agent** (alternate): "automates real-world business workflows end-to-end … handle ambiguous inputs, invoke external tools, and incorporate human-in-the-loop checkpoints." Our entity-disambiguation, OEFA API tool use, and report-approval HITL fit this precisely.

**Recommendation:** submit to **Track 3**, because the multi-agent collaboration is the architectural story, and lean on the Track-4-style HITL/tools as supporting strength. **ASSUMPTION:** a project may target one track; confirm whether multi-track submission is allowed. The judging criteria (Technical Depth 30%, Innovation 30%, Problem Value 25%, Presentation 15%) reward exactly the discipline this architecture provides: modularity, error handling, non-trivial logic.

### 1.3 Mandatory hackathon constraints (from the live rules page)

These are hard requirements the architecture must satisfy:

1. **Qwen models on Qwen Cloud** as the core model provider (DashScope OpenAI-compatible API).
2. **Proof the backend runs on Alibaba Cloud** — a short recording + a link to a code file that demonstrably uses Alibaba Cloud services/APIs.
3. **Public GitHub repo with a detectable open-source license.**
4. **Architecture diagram** showing how Qwen Cloud connects to backend, DB, frontend.
5. **~3-min demo video** + text description + named track.

> **VERIFY:** the rules page now says "Qwen Cloud" and "Qwen and other flagship models" rather than the spec's "DashScope." DashScope is the API surface for Qwen Cloud, so `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` remain valid, but confirm the exact base URL and model names against the current Qwen Cloud console before submission (the international endpoint may differ from the spec's `dashscope-intl.aliyuncs.com`). Model `qwen-plus` is a safe default; check whether a stronger reasoning model (e.g. a `qwen-max`-class or QwQ-class model) is included in the credits and worth using for the planner.

### 1.4 The one-paragraph architecture

A **React/Vite frontend** (CopilotKit as the chat layer, TanStack + Recharts + shadcn for the canvas/dashboard) talks to a **Node/TypeScript backend** (Fastify/Hono) that exposes REST endpoints and a streaming agent endpoint. The backend runs a **Mastra orchestration layer**: one Coordinator workflow that classifies intent, plans typed tasks, routes each task to a specialist Mastra agent by a manifest lookup, runs it, applies a structured result patch to durable state, and streams progress. Specialist agents call **tools** (OEFA Junar API client, RAG retriever, report builder, session/report store). State and artifacts persist in **Alibaba Cloud Tablestore**; uploaded documents and generated report files in **Alibaba Cloud OSS**. Every step appends to an **append-only ledger** that powers both the live "task checklist" UI and the after-the-fact "Trazabilidad" trace.

```
┌────────────────────────── Frontend (apps/web) ──────────────────────────┐
│  CopilotKit chat  │  Canvas (tabs)  │  Dashboard  │  Report view         │
│        │ stream (SSE/AG-UI)         │ TanStack Query (REST)              │
└────────┼───────────────────────────┼───────────────────────────────────┘
         ▼                            ▼
┌────────────────────────── Backend (apps/api) ───────────────────────────┐
│  HTTP (Fastify/Hono): /agent/* (stream) + REST /oefa /documents /rag …   │
│         │                                                                 │
│  ┌──────▼─────────────────── Mastra orchestration ─────────────────────┐ │
│  │  Coordinator workflow:  ingest → plan → [route → run → apply]* → fin │ │
│  │     manifest registry (data) · ledger (audit) · approval gate (HITL) │ │
│  │  Specialist agents: DataAgent · DocsAgent(RAG) · ReportAgent ·       │ │
│  │                     ReportManager · (Verifier, admin)                │ │
│  └──────┬──────────────┬───────────────┬───────────────┬──────────────┘ │
│         ▼              ▼               ▼               ▼                  │
│   OEFA tools     RAG tools      Report tools     Session/Report tools    │
│         │              │               │               │                 │
│  ┌──────▼──────┐  ┌────▼─────┐   ┌─────▼──────┐  ┌──────▼──────────────┐ │
│  │ Junar API   │  │ Embedding│   │ Qwen (Dash │  │ Tablestore (state,  │ │
│  │ datos       │  │ + chunks │   │ Scope) via │  │ sessions, reports,  │ │
│  │ abiertos    │  │ in Table │   │ Mastra LLM │  │ ledger, chunks)     │ │
│  │ OEFA        │  │ store    │   │ provider   │  │ OSS (docs, files)   │ │
│  └─────────────┘  └──────────┘   └────────────┘  └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
            ▲ Qwen Cloud (DashScope)        ▲ Alibaba Cloud (Tablestore + OSS + FC/ECS)
```

---

## 2. Main User Flows

Five flows define the product. Flow A is the spine; the rest reuse its machinery.

### Flow A — Generate a compliance report (the hero flow)
1. Analyst types: *"Genera un informe de antecedentes de Refinería La Pampilla con sus medidas correctivas."*
2. Coordinator classifies intent → `report` and emits a **Plan** (3 tasks) shown in chat as the Plan card.
3. **DataAgent** resolves the entity (RUC), queries OEFA datasets (`RESOL-CON-MULTA-FIRME`, `REGIS-ACTOS-ADMIN-96376`), normalizes records. If the entity is ambiguous → Coordinator emits a **clarification** (needs_user_input) → chat shows candidate cards → user picks → resume.
4. **DocsAgent** retrieves relevant resolution chunks (RAG), attaches them as evidence artifacts with citations.
5. **ReportAgent** combines data + evidence, drafts the structured report (sections per the report skeleton, §12), classifies severity, lists warnings + limitations.
6. **Approval gate (HITL):** before saving/exporting, chat shows an Approval card. Nothing is persisted as a final report until the user approves.
7. On approve, **ReportManager** saves the report + links it to the session; canvas "Informe" tab finalizes; export to PDF/Word/Excel offered.
8. Throughout: each task streams progress to the chat checklist; each artifact carries an agent-attribution chip → opens the trace.

### Flow B — Ask a grounded question (single-shot RAG/data)
"¿Cuántas sanciones firmes tiene la empresa X desde 2020?" → Coordinator plans 1 task → DataAgent (or DocsAgent) → answer with evidence chips in chat + a chart in the canvas. No report, no approval.

### Flow C — Open/search past work
"Abre el último informe de La Pampilla" / "Muéstrame los informes de severidad alta." → Coordinator routes to ReportManager → metadata search → returns results in chat → UI navigates to `/reports/:id` or `/sesiones/:id` (with a navigation toast).

### Flow D — Upload a document and use it
Analyst uploads a resolution PDF/MD → backend stores in OSS → chunk + index into Tablestore → DocsAgent can now cite it. UI confirms indexing in the Documentos tab.

### Flow E — Portfolio / dashboard monitoring
On `/` the dashboard shows KPIs, the supervision-trend and severity charts, and an alert feed sourced from recent OEFA data for a watchlist. "Investigar →" on an alert opens a pre-seeded session (Flow A/B).

---

## 3. UI/UX Principles (binding constraints on the backend)

The full design is in `agentops-debugger-ux-design.md`. The architecture must honor these five, because they shape the API and state contracts:

1. **Evidence-first.** Every claim carries a citation. → The backend must return findings as `{ statement, evidenceIds[] }`, never bare prose, and the ledger/artifact store must hold the cited passages.
2. **The agent shows its work.** Plan, tasks, tool calls, progress are first-class. → The streaming endpoint must emit typed progress events (plan, task-start, task-progress, task-done, result-summary), not just tokens.
3. **Chat drives, canvas remembers.** → The agent returns *structured UI actions* alongside text (open-tab, render-chart, navigate), following the principle that structured durable state is the source of truth and messages are a derived log.
4. **Calm under severity; Spanish-first, legal-correct.** → Severity is an enum with explicit criteria; report language is es-PE with protected legal terms; the mandatory disclaimer is non-editable.
5. **HITL before side effects.** → Saving/exporting a report and any watchlist write pass through an approval gate.

---

## 4. Agentic Core Architecture

### 4.1 Core architectural principles (and deliberate exclusions)

One idea drives everything and is worth stating plainly: **structured, durable state is the source of truth; the chat transcript is a derived log.** Every decision below follows from it. The table triages what the v1 build includes versus what it defers to v2.

| Pattern | Decision | Mastra realization |
|---|---|---|
| Typed cross-boundary contracts (zod schemas for every object) | **BUILD** | `packages/shared` zod schemas: `DomainTaskPacket`, `DomainTaskResult`, `AgentManifest`, `OrchestratorState`, `LedgerEvent`, `Report`, `OefaRecord`, `EvidenceItem`. This is cheap and pays off in Technical-Depth scoring. |
| Structured durable state as truth | **BUILD** | A single `OrchestratorState` object: `executionStatus`, `workspace`, `conversation`, `activeTask`, `pendingTasks`, `completedTasks`, `artifacts`, `ledger`, `interruptState`. Ownership-TTL and per-actor working-context snapshots are deferred to v2. |
| Manifest-driven routing (routing is data; add an agent = add data) | **BUILD (as a registry)** | An `AgentManifestRegistry` mapping `domain+operation → agentId`. Routing is a function call, not a compiled conditional edge. Adding an agent = registering a manifest + its Mastra agent. |
| Orchestration control flow | **BUILD (single bounded loop)** | One Mastra **workflow** with explicit steps (`ingest → plan → route → run → apply → finalize`) and a bounded loop, rather than a large compiled state graph. Mastra workflows give branching/looping natively. |
| Capability-lifecycle 6-phase driver (`normalize→validate→diff→preview→apply→verify`) | **DEFER (v2)** | Overkill: our domain is read-mostly. Keep a *single* approval gate before the only real side effect (save/export report). Note as a v2 extension point. |
| Approval interrupt + durable resume | **BUILD** | Mastra workflow **suspend/resume**. Suspend at the approval/clarification step; persist the suspended state to Tablestore keyed by session; resume on the user's next message. (See §11.) |
| Append-only ledger | **BUILD (ledger); DEFER per-actor visibility filtering** | Keep the ledger (it powers the trace UI and audit — high judging value). The per-agent allow/deny/summarize visibility engine is deferred; all agents in this app are trusted and the user sees everything. Visibility is a v2 multi-tenant concern. |
| Model provider integration | **BUILD (Mastra's model layer)** | Mastra has its own model-provider abstraction. Configure it once for Qwen/DashScope (OpenAI-compatible). No separate gateway to build; Mastra *is* the gateway. One file `services/qwen/qwen-provider.ts` wires it. |
| Artifacts store with typed `ArtifactRef` (`fact/plan/tool_result/...`) | **BUILD** | Evidence passages, normalized record sets, and chart-data are artifacts with stable ids referenced by findings. Persist in Tablestore. |
| Parallel task scheduler (dep-ready, write-conflict-free batching) | **DEFER (v2)** | Run tasks sequentially. Our 3-task plans don't need parallelism; sequential is easier to stream and debug. Note as v2. |
| `nextTasks` as data (enqueue/delegate without a control union) | **BUILD** | A `DomainTaskResult` may carry follow-on packets; the workflow loop drains them. Clean and Mastra-friendly. |
| Dedicated handoff/route engines | **DEFER (v2)** | Unnecessary at this scale; we route by manifest lookup. |
| Replace-only state reducers (last-write-wins; steps assemble full arrays) | **BUILD (as a discipline)** | Each workflow step returns the fully-assembled next state slice; never rely on a merge. Avoids a whole class of bugs. |

### 4.2 The mental model

```
NormalizedUserRequest
  → ingest      : stamp ids, open a ledger turn, load session state
  → plan        : Coordinator (Qwen) classifies intent + emits DomainTaskPacket[]  (or a clarification)
  → route       : manifest lookup picks the owning agent for the active task
  → run         : the specialist Mastra agent executes (calls tools), returns DomainTaskResult
  → apply       : validate result, patch workspace, append ledger, advance queue
  → (loop route→run→apply until queue drains or suspend)
  → finalize    : draft the reply + structured UI actions; write conversation memory
```

This is the spine of the system: a small, explicit step sequence with a bounded loop. The **core invariant**: adding agent N+1 never edits the workflow — only the manifest registry and the agent map grow.

---

## 5. Mastra-based Orchestration Design

### 5.1 Why a Mastra workflow (not a hand-rolled loop)

Mastra provides **Agents** (LLM + tools + memory) and **Workflows** (typed, durable, branching/looping step graphs with suspend/resume). The Coordinator is best expressed as a **workflow** because we need: a bounded loop over tasks, a suspend point for HITL, and durable resume across HTTP requests. Specialist agents are best expressed as Mastra **Agents** because each is an LLM with a focused toolset.

> **Mastra construct notes (for Claude Code):**
> - Control flow uses Mastra workflow primitives: `.step()` / `.then()` / `.branch()` / `.while()` (or `dountil`). The router predicates branch over `state.executionStatus` / `state.activeTask`.
> - HITL uses Mastra workflow `suspend()` / `resume()` with a Tablestore-backed snapshot. (If Mastra has no Tablestore storage adapter, implement the snapshot persistence in our own `session-store` and pass the resume token — see §11.)
> - State is a single typed `OrchestratorState` object threaded through steps; each step returns the next state. No channel reducers needed.
> - Dependency injection: a `createCoordinatorWorkflow(deps)` factory closes over the manifest registry, agent map, tools, and stores — one seam per concern, so the workflow is testable with mocks.

### 5.2 The Coordinator workflow (step contracts)

```ts
// apps/api/src/mastra/orchestrator/coordinator-workflow.ts  (sketch, not final code)
createWorkflow({ id: "agentops-coordinator", inputSchema, outputSchema })
  .then(ingestStep)     // load/init OrchestratorState from session; open ledger turn
  .then(planStep)       // Coordinator agent → DomainTaskPacket[] OR clarification(needs_user_input)
  .branch([
    [ (s) => s.executionStatus === "waiting", finishWaitingStep ],  // clarification/approval → suspend
    [ (s) => !!s.activeTask,                  taskLoop          ],  // run tasks
    [ () => true,                             finalizeStep      ],  // nothing to do → reply
  ]);

// taskLoop  (bounded by a MAX_TASK_STEPS guard)
.dountil(
  workflow()
    .then(routeStep)    // manifest lookup → activeTask.agentId
    .then(runStep)      // specialist agent executes → DomainTaskResult
    .then(applyStep),   // validate + patch + ledger + advance queue; may suspend at approval gate
  (s) => s.pendingTasks.length === 0 || s.executionStatus !== "running"
)
.then(finalizeStep);
```

Key decisions:
- **Add a `MAX_TASK_STEPS` guard** (e.g. 12). The loop relies on the queue draining, but a hard cap prevents runaway loops and demonstrates deliberate error handling.
- **Each step is pure-ish:** reads `OrchestratorState`, returns the next `OrchestratorState`. Side effects (tool calls, persistence) happen inside `runStep`/`applyStep` and are recorded in the ledger.
- **Streaming:** an `onProgress(event)` callback is threaded through every step and pushed to the SSE/AG-UI stream so the chat checklist updates live.

### 5.3 The manifest registry (routing as data)

```ts
// packages/shared/src/manifests.ts
type AgentManifest = {
  agentId: string;
  ownsDomains: string[];        // e.g. ["oefa_data"]
  supportedOperations: DomainOperation[]; // plan|explain|verify|search|report|...
  toolNames: string[];
  approvalPolicy?: "none" | "required"; // default none; ReportManager.save = required
};
// route: find m where m.ownsDomains.includes(task.domain) && m.supportedOperations.includes(task.operation)
```

This is the single most valuable property for the "Agent Society" track: **the collaboration topology is declared data, and task decomposition + role assignment is explicit and inspectable** — exactly what the track asks teams to showcase.

---

## 6. Agents and Their Responsibilities

Surface-level only; internals are the dev team's. Each maps to a Mastra Agent with a system prompt, a toolset, and (for the Coordinator) the workflow above. UI names are Spanish (see UX doc §5).

| Agent | domain / operations it owns | Tools | Output it contributes |
|---|---|---|---|
| **Coordinator** (`Coordinador`) | routing only; owns `plan` | none (reasons over state) | A `DomainTaskPacket[]` plan with one-paragraph reasoning, or a clarification question. Returns structured UI actions. |
| **DataAgent** (`Agente de Datos OEFA`) | `oefa_data`: `search`, `explain`, `verify` | `list_oefa_datasets`, `fetch_oefa_dataset`, `search_oefa_records`, `get_company_oefa_profile` | Normalized `OefaRecord[]`, statistics, chart-ready aggregates, firmness/status flags. |
| **DocsAgent** (`Agente de Documentos`) | `oefa_docs`: `search`, `explain` | `retrieve_oefa_context`, `index_oefa_document` | Cited evidence passages (`EvidenceItem[]`) with doc/resolution/page, unsupported-claim flags. |
| **ReportAgent** (`Agente de Informes`) | `report`: `create` | (consumes artifacts; may call data/docs tools) | A structured `Report` draft: summary, findings(+evidence), warnings(severity), recommendations, limitations, sources. |
| **ReportManager** (`Gestor de Expedientes`) | `report_admin`: `create`(save), `search`, `update`, `delete` | `save_report`, `search_reports`, `open_session`, `archive_report` | Persisted reports/sessions; search results; navigation UI actions. `save`/`delete` carry `approvalPolicy: required`. |
| **Verifier** (`Verificador`, admin) | `eval`: `verify` | `run_eval_case` | (v2/admin) regression cases from failed flows. Behind a role flag; not in the main demo path. |

**Collaboration pattern (the track story):** Coordinator decomposes → assigns roles by manifest → DataAgent and DocsAgent produce evidence independently → ReportAgent synthesizes → ReportManager persists after HITL. Disagreement/conflict handling for the "Agent Society" rubric: the **guardrail in `applyStep`** drops any ReportAgent claim not backed by a DataAgent/DocsAgent artifact (evidence-first enforced at the orchestration layer, not by trusting the LLM).

---

## 7. Tools and External Integrations

Tools are Mastra tools (typed input/output zod schemas), grouped by service.

### 7.1 OEFA tools (`services/oefa/`)
Backed by the verified Junar API (see `oefa-api-verification.md`). The client wraps:
```
GET http://api.datosabiertos.oefa.gob.pe/api/v2/datastreams/{GUID}/data.json/?auth_key=${OEFA_API_KEY}&limit=&offset=
GET http://api.datosabiertos.oefa.gob.pe/api/v2/dashboards/{GUID}.json/?auth_key=${OEFA_API_KEY}
```
- **Verified dataset GUIDs** (drop-in `OEFA_DATASETS`): `INFOR-ELABO` (supervisiones concluidas, dashboard), `RESOL-CON-MULTA-FIRME` (firm sanctions — the report core), `REGIS-ACTOS-ADMIN-96376` (administrative acts incl. corrective measures), `MEDID-ADMIN-DE-LAS-DIREC` (supervision measures), `INFOR-DE-LA-DIREC-28304` (supervision reports), `EXPED-RESUE-15640` (resolved case files).
- `oefa-normalizer.ts` maps Junar response rows → `OefaRecord`. Use the RUIAS data dictionary (XLSX on datosabiertos.gob.pe) as the column reference.
- **Resilience (FR-14):** cache every response in Tablestore with a fetch timestamp; on API failure, serve cache and stamp it "datos en caché del DD/MM". Confirm Junar pagination params and rate limits at build time.
- **HTTPS caveat:** OEFA's examples use HTTP. If only HTTP is available, the Alibaba Cloud egress config must allow it; never put `auth_key` in logs.

### 7.2 RAG tools (`services/rag/`)
`chunker.ts` (token-aware splitting) → embeddings → store chunks + vectors + metadata in Tablestore → `retriever.ts` (hybrid: vector + keyword filter by `documentType`, `source`).
- **Embeddings decision (VERIFY):** prefer a Qwen/DashScope embeddings model (e.g. `text-embedding-v*`) so the whole pipeline stays on Qwen Cloud — this strengthens the "uses Qwen Cloud" requirement. If unavailable in the hackathon credits, fall back to a lightweight local lexical index for the MVP (a searchable text index is an acceptable substitute for embeddings). Mark which path you took in the README.

### 7.3 Report tools (`services/report/` + skills)
`build_report` assembles the structured `Report`; export tools render to PDF/DOCX/XLSX. Reuse the file-generation approach from the requirements doc (timeline, charts as images, mandatory disclaimer). Store generated files in OSS; return signed/temporary URLs.

### 7.4 Session/report store tools (`services/storage/`)
CRUD over Tablestore for `Session` and `Report`; metadata search for Flow C.

### 7.5 Model integration (Qwen Cloud)
One provider config (`services/qwen/qwen-provider.ts`) pointing Mastra at DashScope's OpenAI-compatible endpoint with `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` / `QWEN_MODEL`. The Coordinator (planning) benefits from a stronger reasoning model; specialist agents can use `qwen-plus`. **This is the file to link as Alibaba-Cloud-usage proof** alongside the Tablestore/OSS clients.

---

## 8. OEFA Document Usage and Testing Strategy

### 8.1 Document corpus (preloaded so the demo is never empty)
Ship a small curated corpus under `apps/api/src/data/oefa/docs/`: 2–3 DFAI resolutions, 1 TFA resolution, transparency guidance, and the project taxonomy (risk taxonomy, report template, warning levels) — all as Markdown extracted from public OEFA PDFs. Plus a **seed `OefaRecord` set** from the RUIAS CSV so DataAgent works offline if the API is down during judging.

### 8.2 Testing strategy (Vitest)
This section directly serves the "error handling / engineering" judging weight.

1. **Contract tests** — every zod schema parses its fixtures and rejects malformed input.
2. **Routing tests** — `resolveManifestForTask` returns the right agent for each `domain+operation`; unknown pairs error cleanly.
3. **Tool tests** — OEFA client against recorded Junar fixtures (record real responses once, replay offline); normalizer maps fixtures → `OefaRecord`; retriever returns expected chunks for a known query.
4. **Orchestration tests** — the workflow over a mocked agent map: a 3-task plan drains the queue; a clarification suspends; the approval gate blocks save until resume; `MAX_TASK_STEPS` halts a pathological loop.
5. **Guardrail test** — a ReportAgent output with an uncited claim is stripped/flagged by `applyStep`.
6. **Eval set (Verifier, optional)** — a handful of golden Q→expected-evidence pairs; assert citation precision. Great for the demo's "measurable" angle.

Keep fixtures committed so tests run with no network and no API key (important for reviewers cloning the repo).

---

## 9. Data Flow (frontend ↔ backend ↔ agents ↔ storage)

### 9.1 A report request, end to end
```
[web] user message ──POST /agent/oefa-report (stream)──▶ [api route]
  route → load Session+OrchestratorState from Tablestore (or init)
        → run Coordinator workflow:
            planStep   → Qwen → DomainTaskPacket[]         ──progress: "plan"──▶ [web] Plan card
            routeStep  → manifest → DataAgent
            runStep    → DataAgent → oefa tools → Junar API ──progress: "task"──▶ [web] checklist (running)
                       → normalized records cached in Tablestore (artifact)
            applyStep  → patch state, append ledger          ──progress: "task-done"──▶ [web] checklist ✓
            routeStep  → DocsAgent → retriever → Tablestore chunks (evidence artifacts)
            runStep/applyStep …
            routeStep  → ReportAgent → draft Report (consumes artifacts)
            applyStep  → guardrail strips uncited claims
            >>> SUSPEND at approval gate <<<                 ──progress: "approval"──▶ [web] Approval card
  [web] user approves ──POST /agent/oefa-report/resume──▶ [api] resume workflow
            ReportManager.save → Tablestore (Report) + OSS (files)
            finalizeStep → reply + UI actions (open "Informe" tab, navigate)
  ◀──result-summary event + final text──  [web] Result card + canvas update
```

### 9.2 What crosses each boundary
- **web → api:** `NormalizedUserRequest` (text + sessionId + requestContext). Never secrets.
- **api → agents:** `OrchestratorState` + injected deps. Internal only.
- **agents → storage:** typed artifacts, records, reports, ledger events.
- **api → web (stream):** typed progress events + final `{ text, uiActions[], resultSummary, evidence[] }`. The UI actions are how "chat reflects info into the dashboard/canvas."

---

## 10. API Endpoints

The API surface, with refinements for this architecture:

**Streaming agent endpoints (the important ones):**
```
POST /agent/oefa-report          # Flow A — streams plan/task/approval/result events
POST /agent/oefa-report/resume   # resume after HITL approval or clarification (carries resume token)
POST /agent/ask                  # Flow B — grounded Q&A, streams
POST /agent/search-reports       # Flow C — routes to ReportManager
```
**REST (TanStack Query):**
```
GET  /health
GET  /oefa/datasets · GET /oefa/datasets/:id · GET /oefa/search · GET /oefa/company/:name
POST /documents/upload · GET /documents · GET /documents/:id · POST /documents/:id/index · DELETE /documents/:id
POST /rag/retrieve · POST /rag/index
POST /sessions · GET /sessions · GET /sessions/:id · PATCH /sessions/:id · GET /sessions/:id/messages
GET  /reports · GET /reports/:id · POST /reports/search · PATCH /reports/:id
GET  /trace/:sessionId           # NEW — returns the ledger for the Trazabilidad view (AgentOps debugger)
```
- The streaming endpoints emit a typed event envelope `{ type: "plan"|"task_start"|"task_progress"|"task_done"|"approval_required"|"result"|"error", payload }`. This single contract powers the entire live UI.
- `DELETE` endpoints exist but the UI gates them behind confirmation; never hard-delete from an agent action without explicit user approval (HITL rule).
- CopilotKit attaches to the `/agent/*` stream; it is the chat transport only, not a decision-maker.

---

## 11. State Management and Persistence

### 11.1 The state object
```ts
type OrchestratorState = {
  runId: string; threadId: string; sessionId: string;
  executionStatus: "running" | "waiting" | "completed" | "failed";
  workspace: { domains: Record<string,unknown>; sharedFacts: Record<string,unknown>; entityRefs: Record<string,string> };
  conversation: { rollingSummary: string; turnSummaries: TurnSummary[]; entityIndex: Record<string,string>; decisionLog: DecisionRecord[] };
  activeTask?: DomainTaskPacket;
  pendingTasks: DomainTaskPacket[];
  completedTasks: DomainTaskResult[];
  artifacts: Record<string, ArtifactRecord>;   // evidence, record sets, chart data
  ledger: LedgerEvent[];                        // append-only audit → trace UI
  interruptState?: { interruptId: string; reason: "approval" | "clarification"; taskId?: string };
  finalResponseDraft?: string;
};
```
Conversation memory is **structured** (rolling summary + turn summaries + entity index + decision log), so long sessions reconstruct without replaying the whole transcript. Ownership-TTL and per-actor working-context are deferred to v2.

### 11.2 Persistence (Alibaba Cloud — satisfies the deployment requirement)
- **Tablestore** holds: `sessions`, `reports`, `oefa_records_cache`, `doc_chunks` (+ optional vectors), `ledger_events`, and **`workflow_snapshots`** (the suspended-state blobs for resume).
- **OSS** holds: uploaded documents, generated report files (PDF/DOCX/XLSX), and any chart images.
- **Suspend/resume:** on `suspend()`, serialize `OrchestratorState` + the workflow resume token to `workflow_snapshots` keyed by `sessionId`. The `/resume` endpoint loads it, applies the user's approval/answer, and continues. Because the snapshot lives in Tablestore, suspend/resume is **durable across HTTP requests** — an in-memory-only checkpoint would not survive a process restart between the approval prompt and the user's response.
- Key design follows the persistent-storage convention: hierarchical keys like `report:{id}`, `session:{id}`, `ledger:{sessionId}:{seq}`.

### 11.3 The replace-reducer discipline
Each workflow step returns the fully-assembled next state (arrays rebuilt, not appended-to by the framework). This last-write-wins rule is adopted deliberately: it removes a class of concurrency bugs and makes each step independently testable.

---

## 12. Error Handling and Fallback Behavior

Directly targets the "error handling" judging criterion. Behaviors, from outermost to innermost:

1. **OEFA API down / timeout** → DataAgent tool returns cached records with a staleness stamp; `applyStep` records a `warning`; the UI shows the amber "datos en caché" notice. Never fail the whole run for one stale source.
2. **Entity ambiguous / not found** → DataAgent returns `status: needs_user_input` with candidate refs → workflow suspends → clarification card. (No silent guess — UX rule.)
3. **RAG returns no relevant chunks** → DocsAgent returns an explicit "no evidence found"; ReportAgent must mark affected findings as `sin evidencia suficiente`; the guardrail keeps them visible, not hidden.
4. **ReportAgent emits an uncited claim** → `applyStep` guardrail strips or flags it; logged to ledger as a `guardrail_drop` event surfaced in the Result card ("1 afirmación omitida por falta de evidencia").
5. **Qwen call fails** → one retry with backoff; if it still fails, the step returns `status: failed` with a user-facing summary; workflow routes to `finalize` with a graceful message. No stack traces to the user.
6. **Runaway loop** → `MAX_TASK_STEPS` guard halts and finalizes with a partial-result notice.
7. **Tool input invalid** → zod parse error caught at the tool boundary, returned as a typed tool error, never thrown to the transport.
8. **Persistence write fails** → report generation still returns to the user as an unsaved draft; the UI offers "reintentar guardar"; nothing is lost silently.

General rule: **errors are data, not exceptions across boundaries.** Steps return `{ status: "failed", errors[] }`; only truly unexpected faults bubble to a top-level handler that closes the stream cleanly.

---

## 13. Observability, Tracing, and Evaluation

This is the project's signature feature (the "AgentOps Debugger" name) and a presentation-criterion winner.

- **The ledger is the trace.** Every step appends typed `LedgerEvent`s: `plan_created`, `task_routed`, `tool_called` (with params + duration + result size), `evidence_attached`, `guardrail_drop`, `approval_required`, `approval_granted`, `report_saved`. `GET /trace/:sessionId` returns it; the **Trazabilidad** side sheet renders it.
- **Live progress** uses the same event vocabulary streamed in real time → the chat task-checklist. One event taxonomy serves both live and post-hoc views (DRY, and it demos well).
- **Agent attribution** — every artifact/chart carries the producing `agentId` + timestamp; clicking opens that artifact's ledger slice.
- **Evaluation (optional but high-value)** — the Verifier runs a golden set of Q→expected-evidence pairs and reports citation precision. Surfacing a single number ("citation precision 96% on 20 cases") in the demo directly answers the track's "measurable efficiency/quality" ask.
- **Mastra-native:** use Mastra's built-in workflow run logging/telemetry where available for step timings; layer our domain ledger on top for the evidence-grade audit the regulatory domain needs. Avoid third-party observability SaaS — keep it self-contained for the hackathon (and don't introduce tools outside the planned stack).

---

## 14. Security, Privacy, and Hackathon Compliance

**Secrets:** `OEFA_API_KEY`, `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `QWEN_MODEL`, plus Alibaba Cloud Tablestore/OSS credentials — all from environment variables. Ship `.env.example` with placeholders only. Never commit real keys; never log `auth_key`; keep it out of URLs in logs.

**Privacy:** the app uses public institutional data. Personal data of natural persons appearing in resolutions must not be profiled or aggregated beyond reproducing the public source (Peru Law 29733 posture). Choose privacy-preserving defaults; don't place sensitive data in query strings.

**Disclaimer:** every generated report carries the exact bilingual disclaimer, non-editable, in the footer and the export.

**Hackathon compliance checklist (must all be true at submission):**
- [ ] Uses Qwen models on Qwen Cloud (DashScope) as the core provider — link `qwen-provider.ts`.
- [ ] Backend deployed on Alibaba Cloud (Function Compute or ECS); record the proof video; link a code file using Alibaba services (`tablestore-client.ts` / `oss-client.ts`).
- [ ] Public GitHub repo with a detectable OSS license (e.g. MIT/Apache-2.0) visible in the About section.
- [ ] Architecture diagram included (the §1.4 diagram, rendered).
- [ ] ~3-min demo video (public) + text description + named track (Track 3, recommended).
- [ ] Optional blog post for the Blog Post Award.
- [ ] **VERIFY** the current DashScope base URL / model names and the free-credit model list before submission.
- [ ] **VERIFY** whether single-track submission is required (assume yes; pick Track 3).

---

## 15. Implementation Steps for Claude Code

Build in this order. Each step is independently runnable/testable so progress is always demoable — important under a deadline.

**Phase 0 — Scaffold**
1. Init the pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`. Root files: `README.md`, `LICENSE` (MIT), `.gitignore`, `.gitattributes`, `.env.example`, `pnpm-workspace.yaml`, `package.json`.
2. `packages/shared`: author all zod contracts (§4.1 REUSE row): `DomainTaskPacket`, `DomainTaskResult`, `AgentManifest`, `OrchestratorState`, `LedgerEvent`, `OefaRecord`, `EvidenceItem`, `Report`, `Session`. Write contract tests now (cheap, sets the discipline).

**Phase 1 — Backend foundations**
3. `services/qwen/qwen-provider.ts` — Mastra → DashScope provider. Smoke-test a completion.
4. `services/oefa/` — Junar client + `OEFA_DATASETS` (verified GUIDs) + normalizer. Record fixtures; write tool tests offline.
5. `services/storage/` — Tablestore + OSS clients (Alibaba SDK). `services/rag/` — chunker + retriever (lexical first; Qwen embeddings if available).
6. Seed data: preloaded docs + RUIAS `OefaRecord` seed set under `apps/api/src/data/oefa/`.

**Phase 2 — Orchestration (the core)**
7. `mastra/manifests` — registry + `resolveManifestForTask` + routing tests.
8. `mastra/agents/*` — DataAgent, DocsAgent, ReportAgent, ReportManager as Mastra agents with toolsets and Spanish system prompts.
9. `mastra/orchestrator/coordinator-workflow.ts` — the workflow (§5.2): ingest→plan→loop(route→run→apply)→finalize, with `MAX_TASK_STEPS`, the approval-gate suspend, the evidence guardrail in `applyStep`, and the `onProgress` stream. Orchestration tests over a mocked agent map.

**Phase 3 — API + persistence**
10. Fastify/Hono server: REST endpoints + the `/agent/*` streaming endpoints with the typed event envelope (§10) + `/agent/*/resume` with snapshot load. `/trace/:sessionId`.
11. Suspend/resume via `workflow_snapshots` in Tablestore (§11.2).

**Phase 4 — Frontend**
12. `apps/web` Vite + TanStack Router/Query + Tailwind + shadcn. Routes per UX doc (`/`, `/sesiones/:id`, `/oefa`, `/documentos`, `/reports/:id`).
13. The Workspace: CopilotKit chat bound to `/agent/*`; render Plan card / Task checklist / Result card / Approval card / Evidence chips from the streamed event envelope. Canvas tabs (Resumen/Datos/Documentos/Informe) + Recharts charts + the Trazabilidad side sheet from `/trace`.
14. Dashboard: KPIs, charts, alert feed, sessions table.

**Phase 5 — Reports, polish, compliance**
15. Report export tools (PDF/DOCX/XLSX) with the mandatory disclaimer; store in OSS.
16. Optional Verifier eval set + the citation-precision number for the demo.
17. Deploy backend to Alibaba Cloud Function Compute or ECS; record the proof video; render the architecture diagram; write the README (problem, solution, stack, setup, env, deploy, RAG flow, demo script, disclaimer); record the ~3-min demo.

**Definition of done (hackathon):** search an entity → backend hits a real OEFA endpoint with `OEFA_API_KEY` → Qwen call with `DASHSCOPE_API_KEY` → use preloaded/uploaded docs → retrieve context → generate a structured report → HITL approve → save → reopen via sessions/reports → dashboard chart renders → trace view reproduces the run → deployed on Alibaba Cloud with proof.

---

## Appendix A — Architectural decisions (quick reference)

**Build for v1:** typed contracts; structured durable state as truth; manifest-driven routing; append-only ledger; artifacts with typed refs; `nextTasks`-as-data; replace-reducer discipline; structured conversation memory; one-seam-per-concern dependency injection; a single Mastra workflow with a bounded loop; Mastra suspend/resume backed by Tablestore; Mastra's model layer configured for Qwen; an SSE/AG-UI progress event stream; a `MAX_TASK_STEPS` loop guard; an evidence guardrail in `applyStep`; the `/trace` endpoint as a product feature.

**Defer to v2 (extension points):** the six-phase capability-lifecycle driver; per-actor visibility filtering; the parallel task scheduler; dedicated handoff/route engines; ownership-TTL.

---

## Appendix B — Open items to verify before/at submission

1. DashScope base URL + exact Qwen model names available under hackathon credits (and whether a stronger reasoning model than `qwen-plus` is included).
2. Junar API pagination params, rate limits, and HTTPS availability on `api.datosabiertos.oefa.gob.pe`.
3. The two remaining OEFA dashboard-vs-datastream choices (`resoluciones-emitidas` dashboard `20545`).
4. Whether Qwen Cloud offers an embeddings model in-credits (decides RAG path).
5. Single- vs multi-track submission rules; confirm Track 3 framing.
6. Whether Mastra ships a Tablestore storage adapter or we implement snapshot persistence ourselves (assume the latter).

*End of architecture document.*
