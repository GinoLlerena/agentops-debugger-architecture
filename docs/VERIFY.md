# VERIFY — open items to confirm at build time

Tracked from the architecture doc (Appendix B) and API-verification note (§4). Resolve early; none block Phase 0 scaffolding.

| ID | Item | Owner | Status | Notes |
|---|---|---|---|---|
| B-1 | DashScope base URL + exact Qwen model names available under hackathon credits (and whether a stronger reasoning model than `qwen-plus` is included for the planner) | backend | ⬜ open | International endpoint may differ from `dashscope-intl.aliyuncs.com`. Confirm in Qwen Cloud console. |
| B-2 | Junar API pagination params (limit/offset vs page), max page size, rate limits, and HTTPS availability on `api.datosabiertos.oefa.gob.pe` | backend | ⬜ open | OEFA examples use HTTP. Read Junar docs: https://junar.github.io/docs/es |
| B-3 | `resoluciones-emitidas` dashboard `20545`: consume dashboard endpoint or underlying datastreams? | backend | ⬜ open | Datastreams cleaner for row-level report evidence. |
| B-4 | Does Qwen Cloud offer an embeddings model in-credits? Decides RAG path (Qwen embeddings vs lexical fallback). | backend | ⬜ open | Document chosen path in README. |
| B-5 | Single- vs multi-track submission rules; confirm Track 3 (Agent Society) framing. | lead | ⬜ open | Assume single-track, Track 3. |
| B-6 | Does Mastra ship a Tablestore storage adapter, or do we implement snapshot persistence ourselves? | backend | ⬜ open | Assume the latter (own `session-store`). |

## Field-mapping reference
- Map each datastream's returned fields in `oefa-normalizer.ts` against the **RUIAS data dictionary (XLSX)** on `datosabiertos.gob.pe` as the schema reference.

## Verified facts (do not re-verify)
- Platform is **Junar** (not custom OEFA stack). API key from the portal developer page.
- Dataset GUIDs (working set): `INFOR-ELABO` (dashboard), `RESOL-CON-MULTA-FIRME`, `REGIS-ACTOS-ADMIN-96376`, `MEDID-ADMIN-DE-LAS-DIREC`, `INFOR-DE-LA-DIREC-28304`, `EXPED-RESUE-15640`. (API-verification §2–3, verified 13/06/2026.)
