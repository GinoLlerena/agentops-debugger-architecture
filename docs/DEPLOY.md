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

### Option D — ECS + Docker image over SSH (no registry) ⭐ as executed 2026-07-01

The path actually used for the hackathon deploy. **Why:** ACR *Personal* Edition
is **not available to (newer) international accounts** — the console only offers
Enterprise Edition (subscription, ~$40+/month) and the API returns
`USER_NOT_REGISTERED` in every region. FC can only pull from ACR, so instead:
build locally → `docker save` → `scp` → `docker load` on a pay-as-you-go ECS
instance (~$0.05/h). Same hardened container, no registry at all.

**Prerequisites:** Docker Desktop running; `aliyun` CLI configured (`aliyun sts
GetCallerIdentity` works); the RAM user needs ECS + VPC permissions.

```bash
REGION=ap-southeast-1

# 0. Build for amd64 (matches ECS x86) and export (~146 MB gzipped)
docker build --platform linux/amd64 -t agentops-debugger:latest .
docker save agentops-debugger:latest | gzip > /tmp/agentops-image.tar.gz

# 1. Dedicated SSH key (imported to ECS as a key pair)
ssh-keygen -t ed25519 -f ~/.ssh/agentops_ecs -N "" -C agentops-ecs-deploy
aliyun ecs ImportKeyPair --RegionId $REGION --KeyPairName agentops-ecs \
  --PublicKeyBody "$(cat ~/.ssh/agentops_ecs.pub)"

# 2. Network (a fresh account has NO default VPC — create everything)
aliyun vpc CreateVpc --RegionId $REGION --CidrBlock 192.168.0.0/16 --VpcName agentops-vpc
#    → note VpcId; wait ~5 s for it to be Available before the next call
aliyun vpc CreateVSwitch --RegionId $REGION --VpcId <VpcId> \
  --ZoneId ${REGION}a --CidrBlock 192.168.1.0/24 --VSwitchName agentops-vsw
aliyun ecs CreateSecurityGroup --RegionId $REGION --VpcId <VpcId> \
  --SecurityGroupName agentops-sg
aliyun ecs AuthorizeSecurityGroup --RegionId $REGION --SecurityGroupId <SgId> \
  --IpProtocol tcp --PortRange 22/22 --SourceCidrIp 0.0.0.0/0
aliyun ecs AuthorizeSecurityGroup --RegionId $REGION --SecurityGroupId <SgId> \
  --IpProtocol tcp --PortRange 8787/8787 --SourceCidrIp 0.0.0.0/0

# 3. Instance — ecs.e-c1m2.large (2 vCPU/4 GB economy) is plenty.
#    ⚠ Image: use the PLAIN base image 'ubuntu_24_04_x64_20G_alibase_*'.
#      The first DescribeImages hit may be the 100 GB GPU/CUDA variant, which
#      fails with InvalidSystemDiskSize.LessThanImageSize on a 40 GB disk.
#    ⚠ e-series requires SystemDisk.Category=cloud_essd_entry.
#    ⚠ InternetMaxBandwidthOut > 0 is what allocates the public IP;
#      PayByTraffic bills only transferred GB.
aliyun ecs RunInstances --RegionId $REGION \
  --ImageId "$(aliyun ecs DescribeImages --RegionId $REGION --OSType linux \
      --ImageOwnerAlias system --ImageName 'ubuntu_24_04_x64_20G_alibase*' \
      | jq -r '.Images.Image[0].ImageId')" \
  --InstanceType ecs.e-c1m2.large --InstanceChargeType PostPaid \
  --VSwitchId <VSwitchId> --SecurityGroupId <SgId> --KeyPairName agentops-ecs \
  --InstanceName agentops-demo --InternetMaxBandwidthOut 10 \
  --InternetChargeType PayByTraffic \
  --SystemDisk.Category cloud_essd_entry --SystemDisk.Size 40
#    → poll DescribeInstances until Status=Running and PublicIpAddress is set.
#      sshd takes ANOTHER ~1–2 min after Running — retry ssh, don't panic.

# 4. Install Docker + ship image and env (login user is root on Alibaba images)
IP=<PublicIp>
ssh -i ~/.ssh/agentops_ecs root@$IP \
  "apt-get update -qq && apt-get install -y -qq docker.io && systemctl enable --now docker"
scp -i ~/.ssh/agentops_ecs /tmp/agentops-image.tar.gz root@$IP:/root/
#    app.env: build LOCALLY (never echo secrets), then scp + chmod 600.
#    Contents: DASHSCOPE_API_KEY=…  DEMO_ACCESS_TOKEN=$(openssl rand -hex 16)
#              RATE_LIMIT_PER_MIN=60
#    (DASHSCOPE_BASE_URL not needed: the intl endpoint is the app default.)
scp -i ~/.ssh/agentops_ecs app.env root@$IP:/root/app.env

# 5. Run
ssh -i ~/.ssh/agentops_ecs root@$IP "chmod 600 /root/app.env \
  && docker load < /root/agentops-image.tar.gz \
  && docker run -d --name agentops --restart unless-stopped \
       -p 8787:8787 --env-file /root/app.env agentops-debugger:latest \
  && sleep 4 && curl -s http://localhost:8787/health"
#    → expect {"status":"ok","mode":"live"} — then run the §7 smoke test
#      against http://$IP:8787 (remember the /unlock cookie step).

# Redeploy after a code change = rebuild → save → scp → swap:
ssh -i ~/.ssh/agentops_ecs root@$IP "docker rm -f agentops && docker load \
  < /root/agentops-image.tar.gz && docker run -d --name agentops \
  --restart unless-stopped -p 8787:8787 --env-file /root/app.env \
  agentops-debugger:latest"

# Toggle the demo gate on a running instance (e.g. disable it for judging).
# GOTCHA: --env-file is read at container CREATION — `docker restart` does NOT
# pick up app.env edits. Always rm -f + docker run again:
ssh -i ~/.ssh/agentops_ecs root@$IP \
  "sed -i '/^DEMO_ACCESS_TOKEN=/d' /root/app.env \
   && docker rm -f agentops \
   && docker run -d --name agentops --restart unless-stopped \
        -p 8787:8787 --env-file /root/app.env agentops-debugger:latest \
   && sleep 4 && curl -s http://localhost:8787/health"
# (Re-enable by appending DEMO_ACCESS_TOKEN=<value> to app.env + same swap.)
```

**Teardown (§9) — stop billing the moment proof is captured:**

```bash
# Stop compute charges but keep the instance (restartable, IP may change):
aliyun ecs StopInstance --InstanceId <InstanceId> --StoppedMode StopCharging
# Or release everything (instance → security group → vSwitch → VPC, in order):
aliyun ecs DeleteInstance --InstanceId <InstanceId> --Force true
aliyun ecs DeleteSecurityGroup --RegionId $REGION --SecurityGroupId <SgId>
aliyun vpc DeleteVSwitch --RegionId $REGION --VSwitchId <VSwitchId>
aliyun vpc DeleteVpc --RegionId $REGION --VpcId <VpcId>
```

Gotchas that cost time on 2026-07-01, in one place:
- **ACR Personal = unavailable** on international accounts (`USER_NOT_REGISTERED`,
  console shows only "Create ACR EE"). Don't chase it; use this option.
- **Wrong Ubuntu image variant** → `InvalidSystemDiskSize.LessThanImageSize`.
- **e-series disks** must be `cloud_essd_entry`.
- **SSH timeout right after Running** is normal — cloud-init hasn't finished.
- The **planner/specialist structured output needed live-tolerance fixes**
  (status-enum coercion, degenerate-plan retry) that offline tests structurally
  couldn't catch — always run §7's *live Flow B* after deploying, not just
  `/health`.

> Tablestore + OSS reach is identical across all options. Prefer the **public**
> Tablestore endpoint unless the compute sits in the same VPC (then use the VPC
> endpoint for lower latency + no public traffic).

---

## 7. Verify the deployment (smoke test)

Replace `$HOST` with your deployed origin.

> **If `DEMO_ACCESS_TOKEN` is set (§10),** the `/agent/*`, `/sessions`, `/trace`,
> `/reports`, `/rag` and `/oefa` endpoints below return **401** until you unlock:
> `curl -c cookies.txt "$HOST/unlock?token=$DEMO_ACCESS_TOKEN"` once, then add
> `-b cookies.txt` to each gated `curl`. `/health` and `/health/deep` stay open
> (only the `?llm=1` probe needs the cookie).

```bash
# 0. deep health — pings every configured integration in one shot; the fastest
#    deploy verification (Tablestore/OSS/OEFA probes + Qwen config check).
#    Expect {"status":"ok","mode":"live","services":{...}} with per-service latency.
curl -s $HOST/health/deep
#    Add ?llm=1 for ONE real Qwen generation (proves the model round-trip; costs
#    ~1 token; requires the demo cookie when DEMO_ACCESS_TOKEN is set):
curl -s -b cookies.txt "$HOST/health/deep?llm=1"

# 1. health → expect {"status":"ok","mode":"live"}  (mode:"live" needs DASHSCOPE_API_KEY)
curl -s $HOST/health

# 2. Flow B — streamed, cited answer
curl -N -X POST $HOST/agent/ask -H 'content-type: application/json' -b cookies.txt \
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
- [ ] `/health/deep` reports every configured service `ok` (and `?llm=1` proves
      a real Qwen generation).
- [ ] `/health` reports `mode: "live"`.
- [ ] The browser acceptance walkthrough (§7.1) passes end to end.
- [ ] A fresh `sessionId` appears in `/sessions` **after a process restart**
      (confirms Tablestore, not in-memory).
- [ ] `/trace/:id` returns the ledger for a run.
- [ ] An approved report exports to PDF/DOCX/XLSX, and the object appears in the
      OSS bucket under `reports/<reportId>/informe.<fmt>`.

### 7.1 Browser acceptance walkthrough (manual UI test)

The curl smoke above proves the API; this proves the product. Run it against
`$HOST` in a browser after every deploy — several past bugs (structured-output
variance, HITL card staleness) only ever showed up here, never in unit tests.

**0. Unlock** — if `DEMO_ACCESS_TOKEN` is set, open
`$HOST/unlock?token=<value>` once. *Expect:* redirect to the dashboard.
(Without it, the app loads but every query fails with 401 — the gate working.)

**1. Shell** — *Expect:* green dot + "modo live" in the top bar; in the nav
rail only Panel is clickable — OEFA/Documentos/Reports are dimmed inert
placeholders (planned sections, no routes).

**2. Flow B (cited answer)** — new session, ask
`Antecedentes del administrado con RUC 20543210981`. *Expect, in order:* Plan
card with reasoning → plan morphs into a live checklist (○→◌→✔) → Resumen card
with a formal answer + evidence chips (E1, E2…) → charts in the canvas Datos
tab. Takes ~30–60 s (real model calls). While it runs, scroll up — *expect* the
view to stay put (auto-scroll only engages near the bottom). Click an evidence
chip — *expect* the drawer with document title, passage, confidence.

**3. Trazabilidad** — open the trace sheet. *Expect:* the full ledger including
`llm_call` entries (model, token counts, latency) and `tool_called` entries
(oefa.*/rag.*) with agent attribution — the live-Qwen proof judges look for.

**4. Flow A (report + HITL)** — ask
`Genera un informe del administrado con RUC 20543210981`. *Expect:* an
"Aprobación requerida" card (composer disabled). Click *Aprobar y guardar
informe* — *expect* the save task to run, the Informe tab to open with the
mandatory disclaimer + cited findings. Afterwards the approval card's buttons
must be **permanently disabled** (a consumed card is history, not a control).
Export PDF — *expect* a valid file.

**5. Clarification** — ask `sanciones de bambas`. *Expect:* a clarification
card with 2 candidates instead of a guess; clicking one resumes and completes.
(Live-model caveat: the model occasionally resolves the ambiguity itself and
answers directly — acceptable, just note it.)

**6. Rehydration** — hard-refresh the session URL. *Expect:* conversation,
evidence and charts restored, not a blank page. The dashboard lists the session.

**7. Language** — switch ES→EN in the top bar. *Expect:* full UI flip; an
English question gets an English answer; translated citations offer
"show original".

Known limitations to not misread as failures: a second question in the *same*
session overwrites the previous turn's trace (use one question per session for
recordings); with Stage-1 env (Qwen only) deep health reports
Tablestore/OSS/OEFA as `skipped`.

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

## 9. Cost-safe runbook (deploy → prove → stop)

The hackathon requires **proof** of Alibaba Cloud deployment, **not** a 24/7 live
URL: the rules accept *"a link to a website, functioning demo, **or a test
build**,"* and judges *"are not required to test"* (see [`SUBMISSION.md`](./SUBMISSION.md)).
So you do **not** need to keep compute running. Recommended flow:

1. [ ] **Before anything**, set a **Budget + spending alert** (e.g. $20) in the
       Alibaba Cloud console — the single best safety net.
2. [ ] Develop entirely in **offline mode** (zero LLM cost; the app runs with no
       keys). Keep `QWEN_MODEL=qwen-plus` — never `qwen-max` for bulk testing.
3. [ ] Build + push the image (§6), start the ECS instance / FC function, set the
       env from §1–4.
4. [ ] Run the smoke test (§7) **and** the proof recording (§8) in a single
       session — live `/agent/ask`, `/trace`, a report export to OSS, plus the
       Tablestore/OSS consoles.
5. [ ] **Stop or release the instance** the moment proof is captured. With the
       container image, redeploy takes minutes if a judge ever asks.

> If you instead publish a **persistent live URL** as your demo, the rules ask it
> to stay reachable until the **Judging Period ends (Jul 31, 2026)** — budget
> compute for that whole window. Submitting the **test build (Docker image) +
> video** avoids that entirely. Worst-case costs are in `SUBMISSION.md`.

---

## 10. Security

For any **publicly reachable** deploy, set the three edge-hardening vars
(all optional; the offline/local defaults leave them off):

```bash
# Gate the API behind a shared demo token. Visitors open
#   $HOST/unlock?token=<value>
# once (sets an httpOnly demo_token cookie, 12 h), then use the app normally.
# /health, /health/deep, /unlock, static assets and the SPA stay open; the
# paid-model probe /health/deep?llm=1 requires the cookie.
DEMO_ACCESS_TOKEN=<long-random-string>

# Per-IP token-bucket rate limit on /agent/*, /rag/retrieve and /health/deep.
# Default 0 = disabled — set it (e.g. 60) on any public URL.
RATE_LIMIT_PER_MIN=60

# Max request body for the POST endpoints (default 32768 bytes).
BODY_LIMIT_BYTES=32768
```

**Judging mode:** for the hackathon demo the gate is intentionally **left off**
(`DEMO_ACCESS_TOKEN` unset) so judges can open the URL with zero friction — the
rate limit and body limit stay on, and the deploy is short-lived (started for
review, stopped after). Re-enable the token for any longer-lived exposure. The
gate code stays in place either way; unset var = pass-through (§6 shows the
swap command to toggle it on a running instance).

- [ ] Real keys live only in the compute env / secrets manager — **never** in
      git. `.env.example` ships placeholders only; `.env` is gitignored.
- [ ] On a public URL: `RATE_LIMIT_PER_MIN` is set (see above). Set
      `DEMO_ACCESS_TOKEN` too unless the deploy is a short-lived judging
      window — if set, record the unlock link for the demo/judges.
- [ ] Use a **RAM** user with least-privilege policies, not the root AccessKey.
- [ ] `auth_key` is never logged or placed in URLs (the Junar client redacts it).
- [ ] Keep the OSS bucket private — objects are written and read back by the app
      (streamed to the client), never exposed as public objects.
- [ ] Rotate the AccessKey after the demo.
