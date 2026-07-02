# Devpost registration — copy-paste source

Every field of the Devpost form, ready to paste. Update the two `TODO` links
(video, blog) before submitting. Deadline: **Jul 9, 2026, 2:00 pm PT**.

---

## Project name

```
AgentOps Debugger — OEFA Environmental Compliance
```

## Elevator pitch (tagline)

```
Auditable environmental compliance agents — ask about OEFA (Peru) sanctions in plain Spanish or English and get evidence-cited answers and reports from Qwen agents that show their work.
```

## Track

**Track 3 — Agent Society**

## About the project (description field — paste the markdown below)

---

### Inspiration

Environmental compliance work depends on scattered public records, legal documents, sanctions data, and procedural history. Analysts need answers they can defend, not just chatbot summaries. That inspired **AgentOps Debugger — OEFA Environmental Compliance**: an agentic system that helps investigate regulated entities using OEFA public data while making every conclusion traceable to evidence. The name is the thesis — the agent's work is *debuggable*: every answer ships with the trace that produced it.

### What it does

**AgentOps Debugger** lets users ask natural-language questions — in Spanish or English — about environmental compliance history. It retrieves OEFA records and regulatory documents, builds cited answers, generates charts, drafts structured reports behind a human approval gate, and shows the full agent trace behind the result. You can also start without knowing any entity: ask for a listing of sanctioned companies and click one to launch the investigation, with state-aware suggestions guiding each next step.

Instead of behaving like a black box, AgentOps Debugger exposes:

- the agent plan
- task execution
- retrieved evidence
- generated charts
- report drafts
- human approval steps
- guardrail decisions
- final citations

### How we built it

We built the project as a TypeScript monorepo with:

- **React + Vite** for the frontend workspace
- **Hono + Node.js** for the backend API
- **zod shared contracts** between frontend, backend, and orchestration
- **Qwen on Qwen Cloud (DashScope, OpenAI-compatible) via Mastra + AI SDK v5** for the planner and specialist agents
- **offline fallback agents** so the app works without API keys
- **RAG retrieval** over seeded regulatory documents
- **OEFA data normalization** from public records
- **evidence guardrails** to drop unsupported claims
- **HITL approval** before saving reports
- **PDF/DOCX/XLSX export** for generated reports
- **Tablestore and OSS clients behind storage ports** (durable sessions, ledger, and report files; in-memory offline)
- **a single Docker container (API + SPA) deployed on Alibaba Cloud ECS**, with edge hardening (rate limiting, structured logging with redaction, deep health checks)
- **full ES/EN internationalization**, including translated citations with a "show original" toggle

### Challenges

The hardest part was making the system auditable. It is not enough for an agent to answer correctly; it must show *why* the answer is justified. That required a typed event stream, a persistent ledger, citation contracts, and guardrails that reject findings without evidence.

Another challenge was handling messy real-world public data. Field names, formats, dates, entity names, and legal statuses can vary. We had to normalize records, preserve source context, and avoid guessing when entity matches were ambiguous.

Deploying against the real model taught us that offline tests structurally can't catch everything: live Qwen output varies in ways strict schemas reject — improvised status labels, missing fields, English labels in Spanish contracts. We fixed four rounds of live-only bugs with tolerant schemas that coerce and salvage instead of failing, plus prompt contracts that pin the expected shapes.

We also wanted the project to be demoable without credentials, so we built an offline mode with seed data and deterministic agents while keeping the live Qwen/OEFA path available when configured.

### What we learned

We learned that useful agentic applications need more than prompts. They need contracts, state, evidence, validation, observability, and human control.

The biggest lesson was:

> An agent system becomes trustworthy when every conclusion can be traced back to the data, documents, and decisions that produced it.

### What's next

Next steps: authentication and authorization, live integration with the full OEFA dataset at scale, Stage-2 cloud state (Tablestore/OSS in the deployed environment), deployment automation, and a richer evaluation set for citation accuracy.

---

## Built with (tags)

```
qwen, alibaba-cloud, typescript, react, node.js, hono, mastra, zod, tailwindcss, recharts, docker, tablestore, oss, ecs, vite
```

## Links

| Field | Value |
| --- | --- |
| Code repository | `https://github.com/GinoLlerena/agentops-debugger-architecture` |
| Demo video | `TODO — YouTube/Vimeo/Youku link, < 3 min, public` |
| Try it out | Repo link (Docker test build — see testing instructions below). Do **not** use the ephemeral ECS IP. |
| Blog post (optional prize) | `TODO — optional` |

## Testing instructions (for the judges field)

```
Run locally with Docker (no API keys needed — offline mode with seed data):

  git clone https://github.com/GinoLlerena/agentops-debugger-architecture
  cd agentops-debugger-architecture
  docker compose up --build
  # open http://localhost:8787

Try: click "Lístame las entidades sancionadas en los últimos 5 años" on the
empty session, click an entity, then click the suggested report chip and
approve the report (HITL). Open "Trazabilidad" to see the full agent trace.
Language toggle ES/EN is in the top bar.

Live mode (Qwen on DashScope): copy .env.example to .env, set
DASHSCOPE_API_KEY, and run docker compose up --build again.
```

## Alibaba Cloud / Qwen proof links (paste in description or judges' notes)

- Qwen (DashScope, OpenAI-compatible): `apps/api/src/services/qwen/qwen-provider.ts`
- Tablestore client: `apps/api/src/services/storage/tablestore-client.ts`
- OSS client: `apps/api/src/services/storage/oss-client.ts`
- Deploy runbook (ECS): `docs/DEPLOY.md` §6 Option D
- Architecture diagram: `docs/files/architecture.png` · gallery cover: `docs/files/cover.png`

## Gallery images (upload in this order)

All captured from the **live Alibaba ECS deploy** with real Qwen, English UI
(`docs/files/screenshots/`):

1. `cover.png` — architecture (set as the thumbnail)
2. `03-listing-clickable-entities-en.png` — discovery: clickable sanctioned-entity listing
3. `04-cited-answer-charts-suggestions-en.png` — cited answer + charts + next-step suggestion chips
4. `06-report-draft-hitl-approval-en.png` — report draft + HITL approval gate
5. `07-approved-report-exports-en.png` — approved report with PDF/DOCX/XLSX export
6. `08-traceability-ledger-en.png` — the trace: qwen-plus model calls (tokens, latency) + tool calls
7. `05-evidence-drawer-en.png` — evidence drawer with translated citation + "show original"
8. `02-new-investigation-starters-en.png`, `01-dashboard-en.png` — entry points (optional)
