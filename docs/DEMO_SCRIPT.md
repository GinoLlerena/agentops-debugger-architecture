# Demo script (~3 minutes)

A tight, scene-by-scene walkthrough for the hackathon demo video. Every scene
runs **today in offline mode** (zero keys); the *Live* notes say what changes once
Qwen + Alibaba Cloud are wired (see [`DEPLOY.md`](DEPLOY.md)). Total target: **3:00**.

**Setup (before recording):**

```bash
# terminal 1 — backend
pnpm --filter @agentops/api build && node apps/api/dist/index.js
# terminal 2 — frontend
pnpm --filter @agentops/web dev      # → http://localhost:5173
```

For the *live* recording, run the backend with the env from `DEPLOY.md` so
`/health` shows `mode: "live"`, and point the browser at the deployed URL.

---

### Scene 1 — The problem (0:00–0:20)

> "OEFA publishes Peru's environmental-compliance data as open data, but it's
> scattered across datasets and dense legal resolutions. **AgentOps Debugger**
> lets an analyst ask in plain Spanish and get an **evidence-cited** answer — and
> it **shows its work**."

**Show:** the Dashboard (`/`) — KPIs, charts, sessions table.

---

### Scene 2 — Flow B: grounded Q&A with citations (0:20–1:00)

**Do:** open a session, ask
*"Antecedentes del administrado con RUC 20543210981"*.

**Show, as it streams:**
- the **Plan** card morphing into a live **task checklist**,
- tasks routing to **DataAgent** (OEFA records) and **DocsAgent** (RAG over
  regulations),
- the **Result** with **evidence chips** — click one to open the **evidence
  drawer** (the exact OEFA record / passage behind the claim).

> "Every claim carries a citation. The orchestrator enforces this — an
> **evidence guardrail** rejects any result that asserts without backing."

*Live:* the planner + agents are Qwen models on DashScope; records come from the
real OEFA Junar API.

---

### Scene 3 — Agent-driven canvas (1:00–1:25)

**Show:** the agent's `uiActions` drive the **canvas** — it auto-opens the
**Datos** tab and renders **Recharts** visuals (sanctions-by-year bars, status
distribution, a timeline).

> "The agent doesn't free-form-render UI — it picks from **audited components**
> via a typed contract. Structured generative UI, safe for a regulatory domain."

---

### Scene 4 — Flow A: report + HITL approval (1:25–2:15)

**Do:** ask *"Genera un informe de antecedentes del RUC 20543210981"*.

**Show:**
- a structured **report draft** appears in the **Informe** tab (carátula, resumen
  ejecutivo with risk level, hallazgos with citations, advertencias,
  recomendaciones, anexo de fuentes),
- an **Approval card** — *nothing is saved yet*,
- click **Aprobar** → the run resumes, the report becomes **Aprobado**,
- the **mandatory non-editable disclaimer** in the footer.

> "Side effects pass a **human-in-the-loop gate**. Approve, and only then does it
> persist."

**Do:** click **PDF** (and mention DOCX/XLSX) to download the export.

*Live:* the approved report + files persist to **Tablestore + OSS**.

---

### Scene 5 — Trazabilidad: the AgentOps debugger (2:15–2:45)

**Do:** click **Trazabilidad**.

**Show:** the append-only **ledger** replaying the whole run — `plan_created`,
`task_routed`, `evidence_attached`, `task_done` — the after-the-fact trace that
reproduces exactly how the answer was built.

> "This is the namesake feature: the agent's reasoning is **inspectable and
> auditable**, end to end."

---

### Scene 6 — Cloud + close (2:45–3:00)

**Show (live):** the Alibaba Cloud console — the **FC function / ECS instance**
running it, rows in the **Tablestore** `agentops_kv` table, and the report file in
the **OSS** bucket. Flash the three proof files: `qwen-provider.ts`,
`tablestore-client.ts`, `oss-client.ts`.

> "Qwen Cloud for reasoning, Alibaba Cloud Tablestore and OSS for durable state
> and files — a transparent, evidence-first agent society for environmental
> compliance. **Track 3.**"

---

## Mapping to the hackathon "definition of done"

| Definition-of-done step | Scene |
| --- | --- |
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
