# Demo script (~3 minutes)

A tight, scene-by-scene walkthrough for the hackathon demo video. Every scene
runs **offline** (zero keys) and **live** on the deployed Alibaba Cloud instance
(see [`DEPLOY.md`](DEPLOY.md) §6–7; record against the live URL). Total target: **3:00**.

**Setup (before recording):**

```bash
# terminal 1 — backend
pnpm --filter @agentops/api build && node apps/api/dist/index.js
# terminal 2 — frontend
pnpm --filter @agentops/web dev      # → http://localhost:5173
```

For the *live* recording, run the backend with the env from `DEPLOY.md` so
`/health` shows `mode: "live"`, and point the browser at the deployed URL.

**Record in the English UI:** switch the language toggle in the top bar to
**EN** before recording. All labels, starter chips, and suggestions below use
the English strings.

---

### Scene 1 — The problem (0:00–0:20)

> "OEFA publishes Peru's environmental-compliance data as open data, but it's
> scattered across datasets and dense legal resolutions. **AgentOps Debugger**
> lets an analyst ask in plain English or Spanish and get an **evidence-cited**
> answer — and it **shows its work**."

**Show:** the **Dashboard** (`/`) — KPIs, charts, the **Recent investigations**
table.

---

### Scene 2 — Discovery + Flow B: grounded Q&A with citations (0:20–1:10)

**Do (discovery beat, ~15 s):** click **New investigation**, then the starter
*"List the sanctioned entities in the last 5 years"*. The agent answers
with a **clickable listing** — every sanctioned entity as a candidate card
(name, RUC, sector, record count; deterministic, so it streams fast). Click
**Minera Las Bambas S.A.** — the run resumes into a cited answer for that
entity.

> "You don't need to know a RUC to start — ask for a listing, click an entity,
> and the agent takes it from there."

**Do (grounded Q&A beat):** start another **New investigation**, click the starter
*"Background of the regulated entity with RUC 20543210981"* (or type it).

**Show, as it streams:**
- the **Plan** card morphing into a live **task checklist**,
- tasks routing to **DataAgent** (OEFA records) and **DocsAgent** (RAG over
  regulations),
- the **Result** with **evidence chips** — click one to open the **evidence
  drawer** (the exact OEFA record / passage behind the claim).

*(If time is tight, record both beats and trim the streaming waits in the edit.)*

> "Every claim carries a citation. The orchestrator enforces this — an
> **evidence guardrail** rejects any result that asserts without backing."

*Live:* the planner + agents are Qwen models on DashScope; records come from the
real OEFA Junar API.

---

### Scene 3 — Agent-driven canvas (1:10–1:30)

**Show:** the agent's `uiActions` drive the **canvas** — it auto-opens the
**OEFA Data** tab and renders charts (a **Recharts** sanctions-by-year bar chart
plus a custom segmented status-distribution bar and a procedural timeline).

> "The agent doesn't free-form-render UI — it picks from **audited components**
> via a typed contract. Structured generative UI, safe for a regulatory domain."

---

### Scene 4 — Flow A: report + HITL approval (1:30–2:20)

**Do:** after Scene 2/3 settles, **suggestion chips** appear above the composer —
state-aware next steps (deterministic, localized). Click
*"Generate a background report for Minera Las Bambas S.A."*
(or type *"Generate a background report for RUC 20543210981"*).

**Show:**
- a structured **report draft** appears in the **Report** tab (cover, executive
  summary with risk level, findings with citations, warnings, recommendations,
  sources annex),
- an **"Approval required"** card — *nothing is saved yet*,
- click **"Approve and save report"** → the run resumes, the report badge flips
  to **Approved**,
- the **mandatory non-editable disclaimer** in the footer.

> "Side effects pass a **human-in-the-loop gate**. Approve, and only then does it
> persist."

**Do:** click **PDF** (and mention DOCX/XLSX) to download the export.

*Live:* the approved report persists to **Tablestore**, and exporting it renders
the file once and stores it in **OSS** (served from there on later downloads).

---

### Scene 5 — Traceability: the AgentOps debugger (2:20–2:45)

**Do:** click **Traceability**.

**Show:** the append-only **ledger** replaying the whole run — `plan_created`,
`task_routed`, `evidence_attached`, `task_done` — the after-the-fact trace that
reproduces exactly how the answer was built.

> "This is the namesake feature: the agent's reasoning is **inspectable and
> auditable**, end to end."

---

### Scene 6 — Cloud + close (2:45–3:00)

**Show (live):** the Alibaba Cloud console — the **FC function / ECS instance**
running it, rows in the **Tablestore** `agentops_kv` table
(sessions/reports/ledger/snapshots), and the exported report object in the **OSS**
bucket (`reports/<id>/informe.pdf`). Flash the proof files: `qwen-provider.ts`,
`tablestore-client.ts`, `oss-client.ts` / `report-exporter.ts`.

> "Qwen Cloud for reasoning, Alibaba Cloud Tablestore and OSS for durable state
> and report files — a transparent, evidence-first agent society for
> environmental compliance. **Track 3.**"

---

## Mapping to the hackathon "definition of done"

| Definition-of-done step | Scene |
| --- | --- |
| Discover entities (listing → click → cycle) | 2 |
| Ask an entity → backend hits OEFA | 2 |
| Qwen call (live) | 2 (live) |
| Use docs → retrieve context (RAG) | 2 |
| Generate a structured report | 4 |
| HITL approve → save | 4 |
| Export (PDF/DOCX/XLSX) | 4 |
| Reopen via sessions/reports | 1, 4 |
| Dashboard chart renders | 1, 3 |
| Trace reproduces the run | 5 |
| Deployed on Alibaba Cloud with proof | 6 |
