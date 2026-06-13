# AgentOps Debugger

> Agentic application for **OEFA** (Peru) environmental-compliance analysis. Ask questions in Spanish; a multi-agent system retrieves OEFA open data and regulatory documents, produces **evidence-cited** reports, warnings, and recommendations — and **shows its work** through a transparent execution trace.

**Hackathon:** Qwen Cloud / Alibaba Cloud · Track 3 (Agent Society) · submission deadline 9 Jul 2026.

## Status

🚧 In development. **Phase 0 (scaffold + shared contracts)** complete. See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the full phased plan and [`docs/VERIFY.md`](docs/VERIFY.md) for open items.

## Stack

- **Frontend** (`apps/web`): React + Vite + TanStack Router/Query + Tailwind + shadcn + Recharts + CopilotKit (chat transport).
- **Backend** (`apps/api`): Node/TypeScript (Fastify/Hono) + **Mastra** orchestration (Coordinator workflow + specialist agents) + REST and streaming `/agent/*` endpoints.
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
