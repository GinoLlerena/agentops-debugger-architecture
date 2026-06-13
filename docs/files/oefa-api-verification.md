# OEFA Datos Abiertos — API & Dataset Verification Note

**Verified:** 13 June 2026 · against the live portal `datosabiertos.oefa.gob.pe`
**Purpose:** confirm the API mechanics and replace the `TODO_CONFIRM_GUID` placeholders in the architecture spec with real, verified dataset GUIDs.

---

## 1. API mechanics — confirmed

The architecture spec's endpoint patterns are correct. Two confirmed facts worth recording:

- **Platform:** the portal runs on **Junar**, not a custom OEFA stack. This matters because the request/response format, pagination, and output formats follow Junar's API conventions. Full method docs live at `https://junar.github.io/docs/es` — the dev team should read this, not guess.
- **API key origin:** the key is requested from the portal's developer page (`https://datosabiertos.oefa.gob.pe/developers/`), via Junar — *not* from OEFA through a separate process. The "¡Obtén tu API key!" button issues it. Keep treating it as `OEFA_API_KEY` in env, as the spec already does.

### Confirmed endpoint shapes

```txt
# Datastream (a "vista" / view — most datasets):
http://api.datosabiertos.oefa.gob.pe/api/v2/datastreams/{GUID}/data.json/?auth_key=${OEFA_API_KEY}&limit=50

# Dashboard (a grouping of views):
http://api.datosabiertos.oefa.gob.pe/api/v2/dashboards/{GUID}.json/?auth_key=${OEFA_API_KEY}
```

Notes for the dev team:
- The endpoint is served over **HTTP** in OEFA's own examples. Test whether HTTPS is available; if the backend (on Alibaba Function Compute/ECS) must call HTTP, account for it in egress/security config. Do not assume TLS.
- Output formats: `data.json`, plus XML, CSV, HTML, and `data.ajson` (alternate JSON). Stick to `data.json`.
- `limit` is a supported query param. Junar also supports offset-style pagination — confirm exact param names in the Junar docs before building the paginator (FR-12 in the requirements doc depends on this).
- Response field shapes are Junar-standard; the `oefa-normalizer.ts` layer in the spec is the right place to map them onto your `OefaRecord` type.

---

## 2. Dataset GUIDs — verified replacements

Your spec (§8) had three datasets, two with `TODO_CONFIRM_GUID`. Here is the corrected, verified set. **All GUIDs below were observed on live OEFA dataview/dashboard pages.**

| Spec id | Status | Verified GUID | Type | What it actually contains |
|---|---|---|---|---|
| `supervisionesConcluidas` | ✅ confirmed as-is | `INFOR-ELABO` | dashboard | Supervisiones concluidas — planning, execution and results of compliance verification on administrados. Your spec already had this right. |
| `resolucionesEmitidas` | ✅ resolved | dashboard id `20545` (slug `resoluciones-emitidas`) | dashboard | Resoluciones emitidas. It's a **dashboard** (a container), so for row-level data prefer the datastreams below. |
| `fiscalizacionAmbiental` | ⚠️ reframe | (multi-resource dataset, see note) | dataset | "OEFA - Fiscalización Ambiental" is a *dataset group* covering PAS initiation resolutions, responsibility determinations (DFAI), and fines. Not a single datastream — map to the specific datastreams below instead. |

### Recommended datastreams to add (the high-value ones for your use case)

These are the datasets that directly feed an evidence-based compliance report. **I recommend the dev team adopt these as the working set:**

| Suggested id | Verified GUID | Type | Why it matters for AgentOps Debugger |
|---|---|---|---|
| `resolucionesMultaFirmes` | `RESOL-CON-MULTA-FIRME` | datastream | **"Resolución con multa firmes 2019-2025."** This is the single most important dataset for your product: firm sanction resolutions with fine amounts. It directly powers the "sanciones firmes / exposición en UIT" KPIs, the timeline outcome dots, and the report's findings. The *firmness* status is baked in — which is exactly the resolution-status awareness the requirements doc made a Must-have. |
| `registroActosAdministrativos` | `REGIS-ACTOS-ADMIN-96376` | datastream | **"Registros actos administrativos 2021-2025."** Public registry of administrados declared responsible, sanctioned, and/or given precautionary or corrective measures. Feeds the "medidas correctivas" KPI and the corrective-measures evidence in the report. |
| `medidasAdministrativasSupervision` | `MEDID-ADMIN-DE-LAS-DIREC` | datastream | **"Medidas administrativas de las direcciones de supervisión 2016-2025."** Administrative measures issued during supervision — good for early-warning and the procedural timeline. |
| `informesSupervision` | `INFOR-DE-LA-DIREC-28304` | datastream | **"Informes de la Dirección de Supervisión 2019-2025."** Supervision reports — the "supervisión" milestone on the timeline. (An older `INFOR-DE-LA-DIREC-DE` 2018 view also exists; prefer the 2019-2025 one.) |
| `expedientesResueltos` | `EXPED-RESUE-15640` | datastream | **"Expedientes resueltos 2021-2025."** Resolved case files — useful for precedent analysis (FR-22). |

There are also environmental-sampling datastreams (air, soil, noise, biota — `EAS-COMPO-AMBIE-AIRE`, `EAF-COMPO-AMBIE-SUELO`, `EAC-RUIDO`, `EAT-COMPO-BIOLO`, etc.) from the DEAM evaluations. These are out of scope for v1 (they're monitoring measurements, not compliance/sanction records) but are good v2 candidates if you later want to correlate environmental readings with sanctions.

### A second, complementary source worth knowing about

The **"Registro Único de Infractores Ambientales Sancionados" (RUIAS)** is published on the *national* open-data portal (`datosabiertos.gob.pe`), as downloadable CSV + data dictionary (XLSX) + metadata (DOCX) — not through the Junar API. Its fields map almost one-to-one onto your `OefaRecord` type and explicitly include reincidence (reincidencia), which your design uses as a risk-scoring input. For the hackathon MVP, this CSV is an excellent **preloaded seed dataset**: it gives you realistic, citable rows without depending on live API availability, and its data dictionary tells you exactly what each column means.

Its documented fields include, among others: administrado (infractor) name, unidad fiscalizable name and location, subsector, imputed facts (hechos imputados), breached norm (normativa incumplida), supervision start/end dates, administrative-act date, expediente number, resolución directoral number, resolución de multa number, sanction type, dictated measure, recourse type, and fine amount. Sectors covered: mining, fishing, electricity, hydrocarbons, industry, solid waste, agriculture, and environmental consultancies.

---

## 3. Corrected `OEFA_DATASETS` config (drop-in replacement for spec §8)

```ts
export const OEFA_DATASETS = {
  // --- confirmed from the original spec ---
  supervisionesConcluidas: {
    id: "supervisiones-concluidas",
    guid: "INFOR-ELABO",
    type: "dashboard",
    description: "Supervisiones concluidas (planificación, ejecución y resultados)",
  },

  // --- verified replacements for the TODO_CONFIRM_GUID entries ---
  resolucionesMultaFirmes: {
    id: "resoluciones-multa-firmes",
    guid: "RESOL-CON-MULTA-FIRME",
    type: "datastream",
    description: "Resoluciones con multa firmes 2019-2025 (núcleo del informe)",
  },
  registroActosAdministrativos: {
    id: "registro-actos-administrativos",
    guid: "REGIS-ACTOS-ADMIN-96376",
    type: "datastream",
    description: "Registro de actos administrativos 2021-2025 (responsabilidad, sanciones, medidas)",
  },
  medidasAdministrativasSupervision: {
    id: "medidas-administrativas-supervision",
    guid: "MEDID-ADMIN-DE-LAS-DIREC",
    type: "datastream",
    description: "Medidas administrativas de las direcciones de supervisión 2016-2025",
  },
  informesSupervision: {
    id: "informes-supervision",
    guid: "INFOR-DE-LA-DIREC-28304",
    type: "datastream",
    description: "Informes de la Dirección de Supervisión 2019-2025",
  },
  expedientesResueltos: {
    id: "expedientes-resueltos",
    guid: "EXPED-RESUE-15640",
    type: "datastream",
    description: "Expedientes resueltos 2021-2025 (análisis de precedentes)",
  },
} as const;
```

### Impact on the UX/UI design — nothing breaks, one upgrade

The mockup and design spec hold up. The verification actually *strengthens* two design decisions:

1. The **resolution-status awareness** I built into the design (firm vs. appealed badges, the warning when citing non-firm resolutions) is now backed by a real dataset whose scope is precisely "multa **firmes**." The "Datos OEFA" tab and the timeline outcome dots should source firmness from `RESOL-CON-MULTA-FIRME`.
2. The **"datos al DD/MM/AAAA" stamp** in every chart card is more important than first assumed: these datastreams carry explicit year ranges in their names (2019-2025, 2021-2025, 2016-2025). The stamp should show both the consultation date *and* the dataset's coverage window, so an analyst never mistakes "no data after 2025" for "no events." Suggested stamp text: `API OEFA · RESOL-CON-MULTA-FIRME · cobertura 2019–2025 · consultado 13/06/2026`.

---

## 4. Open items for the dev team to confirm at build time

These need a live key to verify and couldn't be checked from public pages alone:

1. **Exact pagination params** (limit/offset vs. page) and max page size — read the Junar API docs.
2. **Rate limits** per key — Junar enforces them; the graceful-degradation behavior (FR-14) and the "datos en caché" UI state depend on knowing the ceiling.
3. **HTTPS availability** on `api.datosabiertos.oefa.gob.pe` — OEFA's examples use HTTP; confirm before deploying on Alibaba Cloud.
4. **Field names** returned by each datastream — map them in `oefa-normalizer.ts` against the RUIAS data dictionary (XLSX) as the reference schema.
5. **The two remaining GUIDs that are dashboards** (`resoluciones-emitidas` dashboard `20545`) — decide whether to consume the dashboard endpoint or the underlying datastreams; for row-level report evidence, datastreams are cleaner.

---

*Sources: OEFA Datos Abiertos developer page and individual dataview/dashboard pages (datosabiertos.oefa.gob.pe); the national open-data portal entry for RUIAS (datosabiertos.gob.pe). Verified 13 June 2026.*
