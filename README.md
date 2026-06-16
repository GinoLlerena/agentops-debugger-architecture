# AgentOps Debugger

> Agentic application for **OEFA** (Peru) environmental-compliance analysis. Ask questions in Spanish; a multi-agent system retrieves OEFA open data and regulatory documents, produces **evidence-cited** reports, warnings, and recommendations — and **shows its work** through a transparent execution trace.

**Hackathon:** Qwen Cloud / Alibaba Cloud · Track 3 (Agent Society) · submission deadline 9 Jul 2026.

## Status

🚧 In development.

- **Phase 0** — scaffold + shared zod contracts ✅
- **Phase 1** — backend service foundations ✅ (Qwen provider, OEFA Junar client + normalizer + tools, storage ports with in-memory ⇄ Tablestore/OSS, RAG chunker + hybrid retriever, offline seed data)
- **Phase 2** — orchestration core ✅ (manifest-driven routing, the Coordinator engine with evidence guardrail + HITL suspend/resume + MAX_TASK_STEPS, and the Mastra specialist agents + planner over Qwen)
- **Phase 3** — API + persistence + first vertical slice ✅ (Hono server: streaming `/agent/*` with the typed event envelope, REST + `/trace/:sessionId`, durable suspend/resume, **Flow B grounded Q&A end-to-end**)
- **Next: Phase 4** — frontend workspace (chat + canvas, trace sheet, dashboard).

### Run the API

```bash
pnpm --filter @agentops/api build && node apps/api/dist/index.js
# → AgentOps Debugger API · modo offline · http://localhost:8787
curl -s http://localhost:8787/health
curl -N -X POST http://localhost:8787/agent/ask -H 'content-type: application/json' \
  -d '{"text":"Antecedentes del administrado con RUC 20543210981","sessionId":"demo"}'
```

With no keys it runs in **offline mode** (seed records, lexical RAG, no-LLM agents) — the full Flow B streams cited results. Set `DASHSCOPE_API_KEY` (+ `OEFA_API_KEY`) to switch to **live mode** (Mastra agents + Qwen, real OEFA API).

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the full phased plan and [`docs/VERIFY.md`](docs/VERIFY.md) for open items.

### RAG path
Retrieval is **hybrid**: a BM25 lexical index always runs; when `QWEN_EMBEDDING_MODEL` is configured it is blended with Qwen Cloud vector similarity. With no embeddings model in credits, the **lexical path is the offline-capable default** (decision D4). All service tests run with **no network and no API keys** — external clients (Qwen, Junar, Tablestore, OSS) sit behind interfaces with in-memory/fixture-backed implementations.

## Stack

- **Frontend** (`apps/web`): React + Vite + TanStack Router/Query + Tailwind + shadcn + Recharts + CopilotKit (chat transport).
- **Backend** (`apps/api`): Node/TypeScript (Fastify/Hono) + **Mastra** agents (built on the Vercel AI SDK v5 → Qwen Cloud) behind a framework-agnostic, dependency-injected Coordinator engine + REST and streaming `/agent/*` endpoints. The orchestration core is testable with mocked agents (no live LLM); the manifest registry makes routing declarative data.
- **Contracts** (`packages/shared`): zod schemas shared across boundaries (the single source of truth).
- **Models:** Qwen Cloud via DashScope (OpenAI-compatible).
- **Persistence:** Alibaba Cloud Tablestore (state, sessions, reports, ledger, cache, chunks, snapshots) + OSS (documents, exports).
- **Data:** OEFA Datos Abiertos (Junar API) + RUIAS CSV seed.

## Monorepo layout

```
apps/web         # React frontend (Phase 4)
apps/api         # Node backend + Mastra orchestration (Phases 1–3, 5)
packages/shared  # zod contracts + shared types (Phase 0) ✅
docs/            # specs, implementation plan, verification notes
```

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in keys; see docs/VERIFY.md
pnpm test              # runs contract tests offline (no network, no keys)
pnpm build
```

## Project principles

1. **Evidence-first** — no claim without a citation; the guardrail enforces it at the orchestration layer.
2. **The agent shows its work** — plan, tool calls, and verification are first-class (the "AgentOps Debugger").
3. **Spanish-first, legal-correct** — protected legal terms; non-editable disclaimer.
4. **HITL before side effects** — saving/exporting a report passes an approval gate.

## License

[MIT](LICENSE).

> The application uses **public institutional data** only and does **not** constitute legal advice. Generated reports carry a mandatory non-editable disclaimer.
