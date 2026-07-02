# Hackathon submission checklist

Maps every requirement from the **Global AI Hackathon Series with Qwen Cloud**
([rules](https://qwencloud-hackathon.devpost.com/rules)) to the exact artifact in
this repo that satisfies it. Track: **Track 3 — Agent Society**.

> Rules summary that drives this checklist: the deployment requirement is **proof**
> (a code-file link demonstrating use of Alibaba Cloud services/APIs + showing the
> backend ran on Alibaba), **not** a persistent live URL. Access may be provided as
> *"a website, functioning demo, or a test build,"* and judges *"are not required
> to test."* So a **Docker test build + video + deploy proof** is sufficient — see
> the cost-safe runbook in [`DEPLOY.md` §9](./DEPLOY.md).

## Key dates (PT)
- **Submission deadline:** Jul 9, 2026, 2:00 pm
- **Judging period:** Jul 10 – Jul 31, 2026 (the window any provided demo/test build must stay available through)
- **Winners:** ~Aug 7, 2026

## Requirement → artifact

| # | Rule requirement | Status | Artifact / how it's satisfied |
|---|---|---|---|
| 1 | **Build with Qwen models on Qwen Cloud** (mandatory) | ✅ in repo | `apps/api/src/services/qwen/qwen-provider.ts` (DashScope/Qwen, AI-SDK); live mode uses `qwen-plus`/planner model. Show `GET /health` → `{"mode":"live"}`. |
| 2 | **Proof of Alibaba Cloud deployment** — *code file link demonstrating use of Alibaba services/APIs* | ✅ in repo | Link these files in the submission: `qwen-provider.ts`, `apps/api/src/services/storage/tablestore-client.ts`, `apps/api/src/services/storage/oss-client.ts`. Plus a screenshot/clip of the backend running on Alibaba (ECS/FC console). |
| 3 | **Demo video < 3 min** (YouTube/Vimeo/Youku) | ⬜ to record | Script ready in `docs/DEMO_SCRIPT.md`. Record against the deployed URL; upload; paste link in the Devpost form. |
| 4 | **Public code repo + OSI license** with build instructions | ✅ in repo | Public GitHub repo; `LICENSE` (MIT); `README.md` + `docs/DEPLOY.md` for build/run. |
| 5 | **Text description** of features/functionality | ✅ ready | Copy-paste source in [`DEVPOST.md`](./DEVPOST.md) (title, tagline, full "About the project", tags, testing instructions). |
| 6 | **Architecture diagram** | ✅ exported | Official render: `docs/files/architecture.png` (labels match code). Stylized gallery cover: `docs/files/cover.png` (source `cover.svg`). |
| 7 | **Track identification** | ⬜ select | Choose **Track 3 — Agent Society** in the submission form. |
| 8 | **Project available for testing until judging ends (Jul 31)** | ✅ path chosen | **Docker test build**: `docker compose up --build` → `http://localhost:8787`, zero keys (offline mode) — instructions in `README.md` + `DEPLOY.md`. Do **NOT** submit the ephemeral ECS IP as the try-it link (it changes on every stop/start and the instance is stopped after proof capture). |
| 9 | *(Optional)* Blog/social post — Blog Post Prize | ⬜ optional | Publish a short write-up; add its URL to the submission for extra eligibility. |

## Worst-case cost (so there are no surprises)

Approximate (Qwen/ECS unit prices not live-verified — confirm on the
[pricing calculator](https://www.alibabacloud.com/pricing-calculator)). Tablestore/OSS
from their live pricing pages.

| Scenario | Keep running? | Estimated total |
|---|---|---|
| 🟢 **Recommended** — test build + video + proof; deploy ~1 hr to capture proof, then **stop** | No | **~$10–20** |
| 🟠 **Persistent live URL** kept reachable to Jul 31 (~3 wks compute) | Yes | **~$300** |
| 🔴 **Absolute worst** — `qwen-max` everywhere + very heavy run volume | Yes | **~$600–800** |

Cost levers: **model choice** (`qwen-plus`/`qwen-turbo`, never `qwen-max` for bulk),
**don't run compute 24/7**, **develop offline** (no LLM cost), and **set a budget
alert**. Check the hackathon portal for **credits/vouchers** — they typically cover
the Qwen bill (the only real risk).

## Pre-submit final pass
- [ ] Video < 3 min, uploaded, link works (incognito).
- [ ] Repo public; `LICENSE` present; no secrets committed (`.env` gitignored; `.env.example` is placeholders only).
- [ ] Deploy-proof file links + Alibaba console screenshot attached.
- [ ] Architecture diagram image attached.
- [ ] Track 3 selected; description filled.
- [ ] Test build instructions verified from a clean checkout (`docker compose up --build` → `http://localhost:8787`).
- [ ] If using a live URL: confirmed reachable and within budget through Jul 31.
- [ ] Submitted before **Jul 9, 2:00 pm PT**.
