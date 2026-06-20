# Deploy to Alibaba Cloud

Step-by-step checklist to run the AgentOps Debugger backend on **Alibaba Cloud**
with **Qwen Cloud (DashScope)** as the model provider, **Tablestore** for durable
state, and **OSS** for generated report files — satisfying the hackathon
deployment requirement.

> The app boots in **offline mode** with no credentials (seed records, lexical
> RAG, no-LLM agents). Each section below turns one integration **live**; add them
> in any order. `GET /health` reports `{"mode":"live"}` once Qwen is configured.

---

## 0. Prerequisites

- [ ] Alibaba Cloud account + a **RAM user** with an **AccessKey ID/Secret**
      (don't use the root account key). Grant least-privilege policies:
      `AliyunOTSFullAccess` (Tablestore) and `AliyunOSSFullAccess` (OSS), or
      scoped equivalents.
- [ ] Qwen Cloud / **Model Studio (DashScope)** access with an **API key**.
- [ ] (Optional) **OEFA Junar** `auth_key` from
      <https://datosabiertos.oefa.gob.pe/developers/> for live OEFA data.
- [ ] Pick **one region** and keep all services in it to minimize latency
      (e.g. `ap-southeast-1` / Singapore for the international DashScope endpoint).
- [ ] Node 22 + pnpm 9 locally to build.

---

## 1. Qwen Cloud (DashScope) — the model provider

1. [ ] Create an API key in Model Studio.
2. [ ] Note the **OpenAI-compatible base URL** for your region. Default in this
       repo: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
       (mainland: `https://dashscope.aliyuncs.com/compatible-mode/v1`).
3. [ ] Confirm the model names available under your credits (e.g. `qwen-plus`,
       `qwen-max`) and, if you want vector RAG, an embeddings model
       (`text-embedding-v3`). Without an embeddings model the app uses its
       **BM25 lexical** retriever — no action needed.

Env:

```bash
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_PLANNER_MODEL=qwen-max        # optional, stronger reasoning for the planner
QWEN_EMBEDDING_MODEL=text-embedding-v3   # optional; omit → lexical fallback
```

Proof file: `apps/api/src/services/qwen/qwen-provider.ts`.

---

## 2. Tablestore — durable state

The backend uses **one wide-column table** for everything. All collections
(`sessions`, `reports`, `ledger`, `doc_chunks`, `oefa_cache`,
`workflow_snapshots`, `documents`) share it via a composite primary key.

1. [ ] Create a Tablestore **instance** (high-performance) in your region.
2. [ ] Create **one table** named **`agentops_kv`** with this schema:
       - Primary key column 1: **`pk`** — type **STRING** (the collection name)
       - Primary key column 2: **`id`** — type **STRING** (the row id)
       - No predefined attribute columns needed (the app writes a JSON `value`
         attribute + an `updatedAt` attribute dynamically).
       - Max versions: 1; TTL: -1 (never expire).
3. [ ] Copy the instance **endpoint** (VPC or public) and **instance name**.

Env:

```bash
TABLESTORE_ENDPOINT=https://your-instance.ap-southeast-1.ots.aliyuncs.com
TABLESTORE_INSTANCE=your-instance-name
TABLESTORE_ACCESS_KEY_ID=...
TABLESTORE_ACCESS_KEY_SECRET=...
```

Proof file: `apps/api/src/services/storage/tablestore-client.ts` (table name is the
constructor default `agentops_kv`).

> All four `TABLESTORE_*` vars must be set or the app stays on the in-memory store
> (`isTablestoreConfigured`). Partial config = offline storage.

---

## 3. OSS — generated report files

Exporting an **approved** report persists the rendered PDF/DOCX/XLSX to OSS
(under `reportFileKey(id, fmt)`) and serves it from there on later requests — a
read-through cache via the `BlobStore` port (`ReportExporter`). With `OSS_*` set
the store is `OssBlobStore`; unset, it falls back to the in-memory store (the
export still works, just not durably). Document uploads are a future endpoint.

1. [ ] Create an OSS **bucket** in your region (private ACL — objects are written
       by the app and not made public).
2. [ ] Note the OSS **region id** (e.g. `oss-ap-southeast-1`) and bucket name.

Env:

```bash
OSS_REGION=oss-ap-southeast-1
OSS_BUCKET=agentops-debugger
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
```

Proof file: `apps/api/src/services/storage/oss-client.ts`.

---

## 4. OEFA Junar (optional — live open data)

```bash
OEFA_API_KEY=your-junar-auth-key
OEFA_API_BASE_URL=http://api.datosabiertos.oefa.gob.pe/api/v2
```

> Junar's published endpoints use **HTTP**; the compute egress must allow it. The
> client redacts `auth_key` from all logs. Without `OEFA_API_KEY` the app serves
> the bundled RUIAS seed records.

---

## 5. Build

```bash
pnpm install --frozen-lockfile
pnpm -r build            # builds shared, api, web
# backend bundle → apps/api/dist/index.js  (entrypoint)
# frontend bundle → apps/web/dist          (static SPA)
```

The backend is a single Node process: `node apps/api/dist/index.js` (listens on
`PORT`, default `8787`). It loads `.env` via `dotenv` at startup. When
`WEB_DIST_DIR` points at the built SPA (default `apps/web/dist`), **the same
process also serves the front-end same-origin** — so one origin/container hosts
the whole app (no CORS, no separate API base URL). API routes are matched first;
any other GET falls back to `index.html` for client-side routing.

---

## 6. Deploy — pick one

### Option A — Docker (recommended; bundles API + SPA in one container)

The repo ships a `Dockerfile` (+ `docker-compose.yml`). The image builds the
whole workspace and runs the single Node process that serves the API **and** the
SPA same-origin. Runs **offline with zero env**; pass credentials for live mode.

```bash
# Build + run locally (offline) — open http://localhost:8787
docker compose up --build
# or without compose:
docker build -t agentops-debugger .
docker run --rm -p 8787:8787 agentops-debugger

# Live mode: put credentials in .env (see .env.example), then:
docker run --rm -p 8787:8787 --env-file .env agentops-debugger
# (docker compose up automatically loads .env if present)
```

Deploy the image to Alibaba: push to **ACR** (Container Registry), then run it on
**ECS** (Docker), **Function Compute** (container function), or **Serverless App
Engine (SAE)**. Set env vars in the platform's config, expose `PORT` (default
`8787`), and front it with HTTPS. The container's `HEALTHCHECK` curls `/health`.

```bash
# Example: push to ACR
docker tag agentops-debugger registry.<region>.aliyuncs.com/<ns>/agentops-debugger:latest
docker login registry.<region>.aliyuncs.com
docker push registry.<region>.aliyuncs.com/<ns>/agentops-debugger:latest
```

### Option B — ECS without Docker (plain Node)

1. [ ] Launch an ECS instance (Ubuntu 22.04, 1–2 vCPU is plenty) in your region;
       open the security group for your chosen port (or 80/443 behind a proxy).
2. [ ] Install Node 22 + pnpm; clone the repo; `pnpm install && pnpm -r build`.
3. [ ] Create `/etc/agentops.env` (or use a systemd `EnvironmentFile`) with all
       the vars from sections 1–4. **chmod 600**; never commit it.
4. [ ] Run under a process manager so it survives reboots:
       ```bash
       NODE_ENV=production node apps/api/dist/index.js
       # or: pm2 start apps/api/dist/index.js --name agentops-api
       ```
5. [ ] (Recommended) Put **Nginx** in front for TLS (443 → :8787).
6. [ ] Frontend: nothing extra — the API serves `apps/web/dist` same-origin
       (`WEB_DIST_DIR`). Just `pnpm -r build` and run from the repo root. (The
       Vite dev proxy in `apps/web/vite.config.ts` only applies to `pnpm dev`.)

### Option C — Function Compute (serverless)

1. [ ] Create an FC **service** + an **HTTP-triggered function** using a
       **custom runtime** (Node 22) or a **container image** built from
       `apps/api`.
2. [ ] Start command: `node apps/api/dist/index.js`; the function listens on the
       port FC provides — set `PORT` accordingly (FC injects `FC_SERVER_PORT` /
       `9000`; map it to `PORT`).
3. [ ] Set all env vars in the function configuration (use the FC secrets/env
       UI, not the code).
4. [ ] Bind a **custom domain** + HTTPS to the HTTP trigger.
5. [ ] Note FC's request timeout — long Qwen calls must finish within it;
       raise the function timeout if needed.

> Tablestore + OSS reach is identical across all options. Prefer the **public**
> Tablestore endpoint unless the compute sits in the same VPC (then use the VPC
> endpoint for lower latency + no public traffic).

---

## 7. Verify the deployment (smoke test)

Replace `$HOST` with your deployed origin.

```bash
# 1. health → expect {"status":"ok","mode":"live"}  (mode:"live" needs DASHSCOPE_API_KEY)
curl -s $HOST/health

# 2. Flow B — streamed, cited answer
curl -N -X POST $HOST/agent/ask -H 'content-type: application/json' \
  -d '{"text":"Antecedentes del administrado con RUC 20543210981","sessionId":"deploy-smoke"}'

# 3. trace reproduces the run (proves Tablestore persistence)
curl -s $HOST/trace/deploy-smoke | head -c 400

# 4. sessions list survives a process restart  (durable Tablestore state)
curl -s $HOST/sessions

# 5. Flow A — generate report → approve → export PDF (persists to OSS, then served from it)
#    (run the ask, capture reportPreviewId, resume with approval, then:)
curl -s $HOST/reports/<reportId>/export/pdf -o informe.pdf && file informe.pdf
```

Checklist:
- [ ] `/health` reports `mode: "live"`.
- [ ] A fresh `sessionId` appears in `/sessions` **after a process restart**
      (confirms Tablestore, not in-memory).
- [ ] `/trace/:id` returns the ledger for a run.
- [ ] An approved report exports to PDF/DOCX/XLSX, and the object appears in the
      OSS bucket under `reports/<reportId>/informe.<fmt>`.

---

## 8. Hackathon proof recording

- [ ] Record a short screen capture that shows, against the **deployed** URL:
      a live `/agent/ask` request → a cited answer → the `/trace` view, then a
      report generated → approved → exported.
- [ ] On camera or in the description, point at the Alibaba/Qwen seams:
      `qwen-provider.ts`, `tablestore-client.ts`, `oss-client.ts` /
      `report-exporter.ts` — and show the **Tablestore** console with rows in
      `agentops_kv` (sessions/reports/ledger/snapshots) and the **OSS** bucket
      with the exported report object under `reports/<id>/informe.<fmt>`.
- [ ] Capture the Alibaba Cloud console (FC function or ECS instance) to prove
      *where* it runs.

---

## 9. Security

- [ ] Real keys live only in the compute env / secrets manager — **never** in
      git. `.env.example` ships placeholders only; `.env` is gitignored.
- [ ] Use a **RAM** user with least-privilege policies, not the root AccessKey.
- [ ] `auth_key` is never logged or placed in URLs (the Junar client redacts it).
- [ ] Keep the OSS bucket private — objects are written and read back by the app
      (streamed to the client), never exposed as public objects.
- [ ] Rotate the AccessKey after the demo.
