# Requirements Document
## Agentic Application for Environmental Compliance Analysis — OEFA (Peru)

**Document version:** 1.0
**Date:** June 2026
**Status:** Draft for review

---

## 1. Purpose and Scope

This document defines the functional, non-functional, and user-experience requirements for an **agentic AI application** that supports environmental compliance professionals working with public information from **OEFA** (Organismo de Evaluación y Fiscalización Ambiental, Peru).

The application allows the user to ask questions in natural language. An AI agent then plans and executes the necessary steps: retrieving and reading OEFA documents, querying the OEFA public API and open-data portals, analyzing the results, and producing **evidence-based reports, warnings, and recommendations** — always with verifiable citations to the source documents.

The "AgentOps Debugger" component refers to the observability layer that lets the user (or an administrator) inspect, validate, and audit what the agent did: which tools it called, which documents it read, and how it reached each conclusion. In a regulatory domain, this traceability is not optional — it is a core requirement.

---

## 2. Target Persona

| Attribute | Description |
|---|---|
| **Primary persona** | Environmental Compliance Analyst (Analista de Cumplimiento Ambiental) |
| **Secondary personas** | Environmental regulatory affairs specialist, environmental auditor/consultant, in-house legal counsel, sustainability/ESG officer, journalist or NGO researcher using public data |
| **Typical employer** | Mining, energy, hydrocarbons, fishing, industry, agro-export companies; consulting firms; law firms; civil-society organizations |
| **Education** | Environmental engineering, law, environmental sciences |
| **Language** | Spanish (Peru) as working language; English occasionally for corporate or ESG reporting |
| **Technical level** | Comfortable with Excel and web portals; NOT a programmer. The agent must hide all technical complexity (API calls, JSON, queries). |

### 2.1 Jobs to be done

1. Monitor whether a company or supervised unit (unidad fiscalizable) has open supervision, enforcement (PAS — Procedimiento Administrativo Sancionador), or sanction processes before OEFA.
2. Research precedent: how OEFA and the Environmental Enforcement Tribunal (TFA — Tribunal de Fiscalización Ambiental) have ruled in similar cases (same infraction type, sector, or norm).
3. Prepare due-diligence reports on third parties (suppliers, acquisition targets, competitors).
4. Quantify exposure: typical fines (in UIT), corrective measures, and timelines for a given infraction type.
5. Detect early warnings: new resolutions, citizen complaints (SINADA), or supervision activity affecting a portfolio of companies or a geographic zone.
6. Draft compliance reports and recommendations for management, clients, or legal teams — with citations that survive scrutiny.

### 2.2 Pain points the solution must remove

- OEFA information is scattered across PDFs (resolutions, supervision reports), the transparency portal, the open-data platform, and SINADA — manual search is slow.
- Resolutions are long legal PDFs; finding the operative part (parte resolutiva) and the reasoning takes hours.
- No simple way to aggregate: "all sanctions in the mining sector in Arequipa, 2022–2025, by infraction type."
- Risk of citing outdated or superseded resolutions (appealed, annulled, or reconsidered).
- Reports must be rebuilt by hand for every client/format.

---

## 3. Data Sources the Agent Must Handle

| # | Source | Type | Agent capability required |
|---|---|---|---|
| D1 | OEFA public API / open-data portal (datosabiertos.gob.pe and OEFA datasets) | Structured (JSON/CSV) | API tool with pagination, filtering, retry, and schema validation |
| D2 | Resolutions of the TFA and Directorates (DFAI) | PDF (often scanned) | Download, OCR when needed, parsing, section segmentation (vistos, considerandos, parte resolutiva) |
| D3 | Supervision reports / Informes de supervisión | PDF | Same as D2 |
| D4 | SINADA (citizen environmental complaints) | Portal / dataset | Search and aggregation |
| D5 | Registry of supervised units (unidades fiscalizables) and administered entities (administrados) | Structured | Entity resolution (RUC, company name variants) |
| D6 | Normative framework (Ley 29325, RPAS, sector regulations, infraction/sanction tables) | PDF / legal text | Indexed knowledge base with version awareness (which text was in force at the date of the facts) |
| D7 | UIT values by year (for fine conversion to S/ and USD) | Reference table | Maintained lookup table |

**Critical requirement — entity resolution:** the same company appears with different spellings, with/without RUC, or through subsidiaries. The agent must match entities by RUC when available and flag ambiguous matches to the user instead of guessing.

---

## 4. Functional Requirements

Requirements use MoSCoW priority: **M** = Must have, **S** = Should have, **C** = Could have.

### 4.1 Conversational query and retrieval (RAG over OEFA documents)

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The user can ask questions in natural language (Spanish) about OEFA documents, e.g., "¿Qué sanciones tiene la empresa X desde 2020?" | M |
| FR-02 | The agent answers with **inline citations**: document title, resolution number, page/paragraph, date, and a working link to the source PDF. | M |
| FR-03 | Every factual claim in an answer must be traceable to at least one source; if no source is found, the agent must say so explicitly ("No encontré evidencia en las fuentes consultadas") rather than speculate. | M |
| FR-04 | The agent distinguishes resolution status: firm (consentida), appealed, annulled, archived, or in process — and warns the user when citing a non-firm resolution. | M |
| FR-05 | The user can upload their own PDFs (e.g., a resolution received by their company) and ask the agent to compare it against public precedent. | S |
| FR-06 | Semantic + keyword hybrid search over the document corpus, filterable by date range, sector, region, type of document, and infraction code. | M |
| FR-07 | Summarization of long resolutions into a structured brief: facts, imputed infractions, legal basis, sanction/measure, deadlines, and reasoning highlights. | M |
| FR-08 | "Show me the original" — one click from any citation opens the source PDF at the cited page. | M |

### 4.2 OEFA API tool use (agentic data retrieval)

| ID | Requirement | Priority |
|---|---|---|
| FR-10 | The agent autonomously decides when to use the API vs. the document index, and may combine both in one answer. | M |
| FR-11 | API tool supports: search by administrado (RUC/name), by unidad fiscalizable, by sector, by region, by date range, by infraction type, by sanction amount. | M |
| FR-12 | The agent handles API pagination and rate limits transparently; partial results are labeled as partial. | M |
| FR-13 | All API responses are cached with a timestamp; answers display the data-as-of date ("Datos consultados al 12/06/2026"). | M |
| FR-14 | If the API is unavailable, the agent degrades gracefully: informs the user, offers cached data with its date, and queues a retry. | M |
| FR-15 | Scheduled agentic jobs ("vigilancia"): the user defines a watchlist (companies, zones, sectors) and the agent periodically queries the API and emits alerts on new events. | S |

### 4.3 Analysis and computation

| ID | Requirement | Priority |
|---|---|---|
| FR-20 | Aggregations: count and sum of sanctions by company, sector, region, year, infraction type; fines expressed in UIT, Soles (using the UIT of the corresponding year), and optionally USD. | M |
| FR-21 | Trend analysis: evolution of supervision and sanction activity over time for a filter set. | M |
| FR-22 | Precedent analysis: given an infraction description, find the most similar past cases and summarize the outcomes (sanction range, mitigating/aggravating factors considered). | S |
| FR-23 | Risk scoring: a transparent, rule-based compliance risk indicator per company/unit (e.g., based on recurrence, severity, open processes). The formula must be visible and documented — no black-box score. | S |
| FR-24 | Comparison mode: side-by-side of 2–5 companies or units across the same indicators. | S |
| FR-25 | Deadline calculator: from a resolution's notification date, compute appeal and compliance deadlines per the applicable procedural rules, clearly labeled as "referential, verify with legal counsel." | C |

### 4.4 Report, warning, and recommendation generation

| ID | Requirement | Priority |
|---|---|---|
| FR-30 | One-command report generation from a conversation or a saved query, using predefined templates (see Section 6). | M |
| FR-31 | Reports export to **PDF and Word (.docx)**; data tables additionally to **Excel (.xlsx)/CSV**; charts embedded as images. | M |
| FR-32 | Every report includes an automatic **"Fuentes y metodología"** annex: list of documents and API queries used, dates of consultation, and agent version. | M |
| FR-33 | Warnings are classified by severity (Informativa / Advertencia / Crítica) with explicit criteria, and always linked to the triggering evidence. | M |
| FR-34 | Recommendations are clearly separated from findings, written in conditional/advisory language, and accompanied by the rationale and sources. The system never presents recommendations as legal advice (mandatory disclaimer). | M |
| FR-35 | Report drafts are editable by the user before export (rich-text editing of the generated draft). | S |
| FR-36 | Report branding: configurable logo, footer, confidentiality label. | C |

### 4.5 Agent transparency and AgentOps (debugger/observability)

| ID | Requirement | Priority |
|---|---|---|
| FR-40 | **Execution trace per answer**: an expandable "¿Cómo llegué a esta respuesta?" panel showing the agent's plan, each tool call (API query parameters, documents retrieved), and intermediate results. | M |
| FR-41 | Hallucination guardrail: before delivering an answer, a verification step checks that cited passages actually support the claims; unsupported claims are removed or flagged. | M |
| FR-42 | Confidence labeling: each finding is labeled (Evidencia directa / Inferencia / Sin evidencia suficiente). | M |
| FR-43 | Full audit log (user, timestamp, question, tools used, sources, answer) retained and exportable — required for internal audit and client defense of the report. | M |
| FR-44 | Human-in-the-loop checkpoints: for report generation and watchlist alerts, the user approves before final emission; the agent never sends anything externally without approval. | M |
| FR-45 | Feedback loop: the user can mark an answer as incorrect, triggering a review queue and improving retrieval/evaluation sets. | S |
| FR-46 | Admin evaluation dashboard: accuracy metrics over a curated test set of questions with known answers (regression testing of the agent after each update). | S |

---

## 5. Visualizations Required

All charts must be exportable (PNG/SVG for documents, underlying data to Excel) and rendered with the source/date stamp.

| ID | Visualization | Use case |
|---|---|---|
| V1 | **Timeline (línea de tiempo procesal)** of a company or case: supervision → PAS start → first-instance resolution → appeal → TFA resolution, with dates and document links on each milestone. | Case tracking; the single most valued visual for this persona. |
| V2 | **Bar charts**: sanctions or fines (in UIT/S/) by year, by sector, by infraction type, by region. | Aggregated analysis, management reports. |
| V3 | **Line chart**: trend of supervision/sanction activity over time for a filter set. | Early-warning context, sector monitoring. |
| V4 | **Geographic map of Peru** (department/province level) with supervised units and event density; clickable markers showing unit name, administrado, and latest events. | Portfolio and territorial risk views. |
| V5 | **Heatmap**: infraction type × sector (or × company) frequency. | Pattern detection, precedent research. |
| V6 | **Risk matrix (semáforo)**: probability/recurrence vs. severity, per company or unit, using the transparent score of FR-23. | Executive summary page of reports. |
| V7 | **Funnel/Sankey of process outcomes**: how many supervisions led to PAS, sanctions, archiving, or corrective measures. | Understanding realistic outcome probabilities. |
| V8 | **Comparison table with sparklines** for multi-company benchmarking. | Due diligence. |
| V9 | **KPI cards** on the dashboard: open processes, new resolutions this month, total exposure (UIT), active alerts. | Daily monitoring landing page. |

Accessibility: color palettes must remain readable for color-blind users (do not encode severity by color alone — use icons/labels too).

---

## 6. Report Structure and Presentation

### 6.1 Standard templates (minimum set)

1. **Informe de Antecedentes Ambientales (company background report)** — due diligence on one administrado.
2. **Informe de Precedentes (precedent brief)** — analysis of how similar infractions were resolved.
3. **Reporte de Monitoreo (watchlist digest)** — periodic alert summary for a portfolio.
4. **Resumen Ejecutivo de Resolución** — structured brief of a single resolution.

### 6.2 Mandatory report skeleton

1. **Carátula**: title, subject entity, period analyzed, date of issue, confidentiality label.
2. **Resumen ejecutivo** (max. 1 page): key findings, risk level, top recommendations.
3. **Alcance y metodología**: questions addressed, sources consulted, consultation dates, limitations.
4. **Hallazgos (findings)**: each finding = statement + evidence (citation with document, number, date, page) + confidence label.
5. **Visualizaciones**: timeline (V1) and the charts relevant to the report type.
6. **Advertencias (warnings)**: severity-classified, evidence-linked.
7. **Recomendaciones**: advisory language, rationale, separated from findings.
8. **Anexo de fuentes**: full list of documents and API queries (FR-32).
9. **Descargo de responsabilidad (disclaimer)**: the report is based on public information as of the consultation date; it does not constitute legal advice; resolution statuses may change.

### 6.3 Presentation rules

- Findings in short, declarative sentences; one finding per paragraph; no adjectives without evidence.
- Monetary amounts always in UIT **and** Soles (with the UIT year used), e.g., "10 UIT (S/ 53,500, UIT 2025)".
- Resolution citation format: *Resolución N.° XXX-20XX-OEFA/TFA-SE, de fecha DD/MM/AAAA, considerando N.°, p. N* — applied consistently and automatically.
- Dates in DD/MM/AAAA format (Peruvian convention).
- Page numbers, version number, and generation timestamp in the footer of every page.

---

## 7. Language Requirements

| ID | Requirement |
|---|---|
| L1 | **Default language: Spanish (es-PE)**, formal register, using the correct Peruvian legal-administrative terminology: administrado, unidad fiscalizable, PAS, medida correctiva, medida cautelar, multa coercitiva, TFA, DFAI, SINADA, UIT, EFA. |
| L2 | The agent must never "translate" legal terms of art into casual synonyms inside findings (e.g., do not replace "medida correctiva" with "castigo"). |
| L3 | Tone in chat: professional but plain — explain legal concepts when the user asks, without condescension. Tone in reports: formal, impersonal, third person. |
| L4 | English output on demand (S priority): full report translation for ESG/corporate audiences, keeping Spanish legal terms with English glosses in parentheses. |
| L5 | A built-in **glossary** of OEFA/legal terms, hover-accessible in the UI and printable as a report annex. |
| L6 | Numbers and dates follow Peruvian conventions (thousands separator, DD/MM/AAAA, "S/" for Soles). |

---

## 8. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Accuracy | On the curated evaluation set (FR-46), citation precision ≥ 95% (cited passage actually supports the claim) before any release. |
| NFR-02 | Traceability | 100% of report findings linked to sources; audit log retention ≥ 5 years (configurable). |
| NFR-03 | Freshness | Document index and API cache refreshed at least daily; freshness date always displayed. |
| NFR-04 | Performance | Simple Q&A ≤ 15 s; complex multi-tool analysis ≤ 2 min with visible progress steps; report generation ≤ 5 min. |
| NFR-05 | Security | Encryption in transit and at rest; role-based access; user documents and watchlists are private per organization. |
| NFR-06 | Privacy | Compliance with Peruvian Law 29733 (protection of personal data): the system works with public institutional data; personal data of natural persons appearing in documents must not be profiled or used beyond reproduction of the public source. |
| NFR-07 | Availability | ≥ 99% monthly for the query interface; watchlist jobs resilient to source downtime. |
| NFR-08 | Usability | A new analyst completes their first cited query and first exported report without training (guided onboarding). No JSON, query syntax, or technical errors ever shown raw to the end user. |
| NFR-09 | Versioning | Agent prompts, tools, and index versions are versioned; every report records the versions used (reproducibility). |
| NFR-10 | Cost control | Per-organization quotas and usage dashboard for long agentic runs. |

---

## 9. Out of Scope (v1)

- Filing documents or interacting with OEFA's procedural systems on behalf of the user (read-only solution).
- Legal advice or predictions of case outcomes presented as certainties.
- Non-public or leaked information; only official public sources.
- Other regulators (ANA, SENACE, MINEM, OSINERGMIN) — candidates for v2 as additional data-source plugins.

---

## 10. Acceptance Criteria Summary (Definition of Done for v1)

1. A user asks about any administrado and receives a cited, status-aware answer combining API data and documents (FR-01–FR-14).
2. A "Informe de Antecedentes Ambientales" is generated, edited, and exported to PDF and Word with timeline, charts, sources annex, and disclaimer (FR-30–FR-34, Section 6).
3. The execution trace panel reproduces every step the agent took for any answer (FR-40).
4. The hallucination guardrail demonstrably blocks at least the known failure cases in the evaluation set (FR-41, FR-46, NFR-01).
5. A watchlist alert fires on a new resolution for a monitored company and links to the source (FR-15, FR-33).

---

*End of document.*
