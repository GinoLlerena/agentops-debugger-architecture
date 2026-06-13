# AgentOps Debugger — UX/UI Design Specification
## Agentic Workspace for OEFA Environmental Compliance

**Version:** 1.0 · June 2026
**Audience:** Product, design, and frontend team (React/Vite/Tailwind/shadcn/Recharts)
**Companion file:** `agentops-debugger-mockups.html` (interactive mockup of the 3 core screens)

---

# 1. Design Vision

**One sentence:** *A digital "expediente" (case file) that builds itself in front of the analyst, while the agent shows its work.*

The product serves analysts in government institutions and environmental NGOs. They don't trust magic — they trust **evidence, traceability, and institutional sobriety**. The interface therefore borrows its central metaphor from the real artifact of this domain: the administrative case file (*expediente*). Every investigation is a file that accumulates evidence, and the agent is a visible, auditable clerk — never a black box.

### Design principles

1. **Evidence-first.** No claim appears in the UI without a citation chip. The citation is a first-class UI atom, not a footnote.
2. **The agent shows its work.** Plans, reasoning, tool calls, and progress are always one click away (and visible by default while running). Trust is built by transparency, not by polish.
3. **Calm under severity.** This tool reports sanctions and risks. Severity is communicated with restraint (labels + icons + color), never with alarmist visuals. The interface never "celebrates" or dramatizes.
4. **Spanish-first, legal-correct.** All UI copy in es-PE, formal but plain. Legal terms of art (*administrado, PAS, medida correctiva, TFA*) are never paraphrased; a glossary tooltip explains them.
5. **Chat drives, canvas remembers.** The conversation is the steering wheel; the canvas/dashboard is the accumulated, persistent state of the investigation. Nothing important lives only in the chat scroll.

---

# 2. Users and Context (recap)

| Persona | Primary goal in UI | Implication |
|---|---|---|
| Compliance analyst (gov / company) | Investigate an administrado, produce a defensible report | Needs citations, statuses, export |
| NGO researcher / journalist | Explore patterns by sector/region | Needs aggregate charts, map-like views, CSV export |
| Legal counsel | Verify precedent and exact wording | Needs one-click jump to source document/page |
| Supervisor / manager | Review and approve reports | Needs read-only report view, severity at a glance |

Working conditions: desktop-first (office, 1366–1920px), long sessions, often two monitors. Mobile is read-only (review a report, check an alert).

---

# 3. Information Architecture

```
┌──────────────────────────────────────────────────────────┐
│  App Shell (left nav rail, 64px collapsed / 240px open)  │
├──────────────────────────────────────────────────────────┤
│  /            Panel (Dashboard)        — portfolio view  │
│  /sesiones    Investigaciones          — session list    │
│  /sesiones/:id  ESPACIO DE TRABAJO     — chat + canvas ★ │
│  /oefa        Explorador OEFA          — raw data search │
│  /oefa/empresa/:nombre  Perfil de administrado           │
│  /documentos  Biblioteca de documentos — upload/index    │
│  /informes/:id  Informe (read-only)    — final report    │
└──────────────────────────────────────────────────────────┘
```

★ The **Workspace** (`/sesiones/:id`) is the heart of the product and gets ~80% of design effort. Dashboard and report view are the other two core screens. The remaining routes are conventional CRUD lists (shadcn `DataTable`).

**Navigation rule:** the agent can navigate for the user ("Abrir el último informe de La Pampilla") — when it does, the UI shows a brief toast: *"El agente abrió el Informe #042"*, so navigation never feels haunted.

---

# 4. The Workspace: Chat + Canvas

## 4.1 Layout anatomy (desktop ≥1280px)

```
┌────┬─────────────────────────────────────────────────────────────┐
│    │  TOP BAR: ⬤ Sesión: "Antecedentes – Refinería La Pampilla"  │
│ N  │  estado: ● Investigando…   [Generar informe] [Exportar ▾]   │
│ A  ├──────────────────────┬──────────────────────────────────────┤
│ V  │  CHAT (≈420px)       │  CANVAS (flexible)                   │
│    │                      │  ┌Tabs: Resumen·Datos·Docs·Informe┐  │
│ R  │  [user bubble]       │  │                                 │  │
│ A  │  [plan card]         │  │   KPI row (4 cards)             │  │
│ I  │  [task checklist]    │  │   Timeline procesal             │  │
│ L  │  [result summary]    │  │   Charts grid (2-col)           │  │
│    │  [evidence chips]    │  │   Evidence drawer (right edge)  │  │
│    │                      │  │                                 │  │
│    │  ┌────────────────┐  │  └─────────────────────────────────┘  │
│    │  │ input + attach │  │                                      │
└────┴──┴────────────────┴──┴──────────────────────────────────────┘
```

- **Chat column:** fixed 400–460px, left side. Left side because reading order (LTR) puts *cause* (the conversation) before *effect* (the canvas).
- **Canvas:** everything the agent produces that has lasting value is *projected* here, organized in tabs. The chat references canvas items with links ("Ver en el panel →").
- **Resizable divider** between chat and canvas; chat collapsible to an icon strip when the user is reading the report full-width.
- Below 1024px: tabs switch between Chat / Panel (no split view).

## 4.2 Chat ↔ Canvas choreography (the core interaction)

The rule the dev team must implement consistently:

> **Chat = narrative + control. Canvas = state + artifacts.**

| The agent... | In chat | In canvas |
|---|---|---|
| Receives a request | Plan card (Section 4.4) | — |
| Calls the OEFA API | Task row with spinner + live caption ("Consultando supervisiones concluidas… 124 registros") | "Datos OEFA" tab badge increments; table rows stream in |
| Retrieves documents (RAG) | Task row + retrieved doc count | "Documentos" tab: retrieved chunks highlighted |
| Computes statistics | Task row | Charts render/update with a subtle 300ms fade-in, each stamped "Datos al 12/06/2026" |
| Finishes | **Result summary card** (Section 4.6) | Canvas auto-switches to the most relevant tab (max 1 auto-switch per task; never yank the user while they're scrolling) |
| Generates a report | Approval card (HITL) | "Informe" tab shows live draft |

Every canvas element created by the agent gets a small **agent attribution chip** in its corner: `⚙ OefaDataAgent · 14:32` — clicking it opens the trace for that element. This is the AgentOps debugger surfacing in normal UX.

## 4.3 Chat message taxonomy

Seven message types, each a distinct component:

1. **User message** — right-aligned bubble, may carry file attachments (PDF/MD).
2. **Plan card** — see 4.4.
3. **Task checklist** — see 4.5.
4. **Result summary card** — see 4.6.
5. **Clarification request** — agent asks one question with 2–4 quick-reply buttons (e.g., entity disambiguation: "Encontré 3 administrados similares: ¿cuál?").
6. **Approval card (HITL)** — before generating/exporting a report or saving a watchlist: shows what will be done, `[Aprobar]` `[Editar]` `[Cancelar]`. Nothing irreversible happens without this card.
7. **Warning/system notice** — e.g., "La API de OEFA no responde. Mostrando datos en caché del 10/06/2026." Amber left border, never modal.

## 4.4 The Plan card (agents + reasoning, made visible)

When the orchestrator classifies the intent, it streams a plan **before** executing. This is the user's moment to redirect cheaply.

```
┌─────────────────────────────────────────────────┐
│ PLAN · Antecedentes de Refinería La Pampilla    │
│ ─────────────────────────────────────────────── │
│ Razonamiento: La consulta pide historial        │
│ sancionador. Combinaré datos públicos de la API │
│ con las resoluciones cargadas para citar la     │
│ parte resolutiva.                                │
│                                                  │
│ 1. ⚙ Agente de Datos OEFA                       │
│    Buscar registros del administrado (RUC)       │
│ 2. ⚙ Agente de Documentos (RAG)                 │
│    Recuperar resoluciones DFAI/TFA relacionadas  │
│ 3. ⚙ Agente de Informes                         │
│    Cruzar datos, detectar advertencias, resumir  │
│                                                  │
│ [▶ Ejecutar plan]   [✎ Ajustar]   [✕ Cancelar]  │
└─────────────────────────────────────────────────┘
```

- **Reasoning is one short paragraph**, plain Spanish — not chain-of-thought dumps. Long internal reasoning lives in the trace view (Section 7), not in chat.
- Auto-executes after 4s for low-stakes read-only plans (with a progress ring on the button); always waits for explicit click when the plan includes saving, exporting, or watchlist changes.
- "Ajustar" turns steps into editable checkboxes (skip RAG, change date range, etc.).

## 4.5 The Task checklist (intermediate state, spinners)

Once running, the plan card morphs into a live checklist — same position, no new message (reduces scroll noise):

```
┌─────────────────────────────────────────────────┐
│ ● Investigando…                       1 de 3     │
│ ✔ Datos OEFA · 124 registros, 8 con sanción     │
│ ◌ Documentos · leyendo Res. 1245-2023-OEFA/DFAI │
│   ▓▓▓▓▓▓░░░░  análisis de 3 documentos          │
│ ○ Informe · en espera                            │
│                                  [Ver detalle ⌄] │
└─────────────────────────────────────────────────┘
```

State system per task row:
- `○` pending (gray) → `◌` running (animated ring + **live caption**, one line, updates in place) → `✔` done (green, with a one-line *result*, not just "done") → `⚠` failed (amber, with the fallback taken) → `⏭` skipped.
- The **live caption is the single most important trust device** in the product: it should name the real thing happening ("Consultando dataset supervisiones-concluidas, página 3/5"), never a generic "Procesando…".
- Elapsed-time counter appears after 10s; after 60s, a "Sigue en curso, puedes seguir trabajando" note + the task continues in background (badge on session in the nav).
- "Ver detalle" expands tool-level rows (API call params, doc IDs) — the lightweight trace, inline.

## 4.6 The Result summary card

Every completed task ends with a compact, scannable summary in chat — the "what you got" anchor the user asked for:

```
┌─────────────────────────────────────────────────┐
│ ✔ RESUMEN · Antecedentes La Pampilla S.A.A.      │
│ 8 sanciones (2019–2025) · 2 PAS en trámite      │
│ Exposición total: 1,240 UIT (S/ 6.6 M)          │
│ Severidad estimada: ▲ Alta                       │
│ ─────────────────────────────────────────────── │
│ Hallazgo principal: reincidencia en exceso de    │
│ LMP en efluentes [E1][E2]                        │
│                                                  │
│ [Ver en el panel →] [Generar informe] [Fuentes 5]│
└─────────────────────────────────────────────────┘
```

- 3 lines of stats max, 1 key finding, evidence chips `[E1]`, and the canvas deep-link.
- This card is also what a returning user sees when reopening a session: the chat's "last result" is pinned at the top of the canvas Resumen tab.

## 4.7 Evidence chips (the signature atom)

`[E1]`, `[E2]` — small mono-font chips attached to every claim, in chat and canvas alike.

- **Hover:** popover with the cited passage (≤2 lines), document name, resolution number, page.
- **Click:** opens the Evidence drawer (right edge of canvas) with the full passage and a "Abrir documento original (p. 14)" link.
- Chip color encodes confidence: solid border = *evidencia directa*; dashed = *inferencia*; a claim with no chip is not allowed by the UI contract — if the backend sends one, render it with a gray "sin fuente" chip so the gap is visible, not hidden.

---

# 5. Agents in the UI

Per the request: responsibilities and UI presence only — internals belong to the dev team.

| Agent (Mastra) | UI name (es) | Icon | Responsibility (UI-relevant) | Where the user sees it |
|---|---|---|---|---|
| AgentOpsOrchestrator | **Coordinador** | ◎ | Classifies intent, writes the Plan card, routes, returns UI actions (navigate, open tab) | Plan card header; toasts when it navigates |
| OefaDataAgent | **Agente de Datos OEFA** | ▤ | API queries, normalization, statistics | Task rows; "Datos OEFA" tab tables/charts; attribution chips |
| OefaRagAgent | **Agente de Documentos** | ❡ | Retrieval over uploaded/preloaded docs, citation, unsupported-claim detection | Task rows; Evidence drawer; "Documentos" tab highlights |
| OefaReportAgent | **Agente de Informes** | ✦ | Combines data+context, drafts the structured report, warnings, limitations | "Informe" tab live draft; Approval card |
| ReportManagerAgent | **Gestor de Expedientes** | ⌸ | Sessions/reports CRUD, search, open/archive | Search results in chat ("Encontré 3 informes…"), navigation toasts |
| RegressionTestAgent | **Verificador** (admin-only) | ✓ | Builds eval cases from failures | Admin trace view only; invisible to analysts |

**UI rules for agents:**
- Agents are presented as *roles in a team*, not personalities. No avatars with faces, no first-person chattiness ("¡Listo! 🎉" is banned). Voice: "Se encontraron 8 sanciones", institutional and impersonal in results; the Coordinador may use first person sparingly in plans ("Combinaré…").
- The user never selects an agent manually; the Coordinador decides. But every artifact says which agent produced it (attribution chip → trace).
- Failure attribution is honest: "El Agente de Datos no pudo consultar la API (timeout). Usé caché del 10/06." — name the agent, the cause, and the fallback.

### Example end-to-end plan (reference for devs/designers)

> **User:** "Genera un informe de antecedentes de Refinería La Pampilla con sus medidas correctivas."
> **Coordinador (reasoning shown):** request = company report + corrective-measures focus → needs API profile + document grounding + report draft → 3 steps, HITL before saving.
> 1. Agente de Datos OEFA → `get_company_oefa_profile` (resolve RUC first; if ambiguous → Clarification message).
> 2. Agente de Documentos → `retrieve_oefa_context("medidas correctivas La Pampilla")` filtered to resoluciones.
> 3. Agente de Informes → draft with sections (Resumen ejecutivo, Registros, Línea de tiempo, Advertencias, Evidencia, Limitaciones) → **Approval card** → on approve, Gestor de Expedientes saves and links report to session.
> Canvas: tab "Datos" fills at step 1, Evidence drawer at step 2, tab "Informe" streams at step 3. Chat ends with Result summary card.

---

# 6. Canvas & Dashboard: Charts and Data Design

## 6.1 Canvas tabs (workspace)

1. **Resumen** — pinned Result summary, KPI row, timeline procesal, top-2 charts.
2. **Datos OEFA** — normalized records table (TanStack Table: column visibility, CSV export, "datos al" stamp), filters synced with what the agent queried.
3. **Documentos** — docs used in this session; retrieved chunks highlighted with the query that fetched them.
4. **Informe** — live draft → final report (same component as `/informes/:id`).

## 6.2 Chart catalog (Recharts) — what, why, and design spec

| # | Chart | Type (Recharts) | Used for | Design notes |
|---|---|---|---|---|
| C1 | **Línea de tiempo procesal** | Custom horizontal timeline (composed; not a stock chart) | Case milestones: supervisión → PAS → resolución → apelación → TFA | The hero visual. Dots sized by event weight, colored by outcome; each dot = popover with date, document, evidence chip. Horizontal scroll for long histories. |
| C2 | Sanciones por año | `BarChart`, vertical bars | Activity over time per company/sector | Single series, units toggle UIT ⇄ S/. Y-axis label states the unit explicitly. |
| C3 | Multas por tipo de infracción | `BarChart` horizontal | Ranking infraction types | Horizontal because labels are long legal phrases; truncate + tooltip full text. Max 8 bars + "Otras (n)". |
| C4 | Registros por sector / región | `BarChart` or small-multiple bars | NGO/portfolio exploration | Prefer small multiples over stacked bars (easier comparison). Region view ordered by value, not alphabetically. |
| C5 | Distribución de severidad | Segmented horizontal bar (100%) | Report/dashboard severity mix | **Not a pie.** One row, 4 segments (Baja/Media/Alta/Crítica) with count labels in-segment. Color + icon + label (color-blind safe). |
| C6 | Evolución de supervisiones | `LineChart`, 1–3 series max | Trend monitoring | Dots only on hover; reference line for annual average. |
| C7 | Embudo de resultados | Custom funnel (stacked bars) | Supervisión → PAS → sanción / archivo | Show absolute n + % conversion at each stage. |
| C8 | Matriz de riesgo | CSS grid heat-cells (not Recharts) | Probability × severity per administrado | 3×3 or 4×4; each cell lists entity chips; clicking a chip opens its profile. Formula link: "¿Cómo se calcula?" → transparent rule list. |
| C9 | Informes en el tiempo / advertencias por tipo | `AreaChart` (single, subtle) / horizontal bars | Dashboard ops view | Keep secondary; no gradients heavier than 8% opacity. |

**Global chart rules**
- Every chart carries: title (the *question* it answers, e.g., "¿Cuántas sanciones por año?"), unit, "Datos al DD/MM/AAAA", source ("API OEFA · supervisiones-concluidas"), and the agent attribution chip.
- Number formatting es-PE: `1 240` thousands space or `1,240`? → use `1,240` (SUNAT/OEFA documents convention), S/ prefix, dates DD/MM/AAAA.
- Severity scale is the only place that uses the alert palette; all other series use the neutral data palette (6.3 below) so severity always pops.
- Empty state per chart: gray outline + "Sin datos para este filtro. Prueba ampliar el rango de fechas." Never render an empty axis.
- Export: PNG + CSV on every chart (kebab menu), because analysts paste into their own slides.

## 6.3 Dashboard (`/`) layout

```
┌ Saludo + búsqueda global ("Buscar administrado, informe o sesión…") ┐
│ KPI: Procesos abiertos · Nuevas resoluciones (mes) ·                │
│      Exposición cartera (UIT) · Alertas activas                     │
├──────────────────────────────┬──────────────────────────────────────┤
│ C6 Evolución supervisiones   │ C5 Severidad de cartera              │
│ C4 Registros por región      │ Lista: Alertas recientes (feed)      │
├──────────────────────────────┴──────────────────────────────────────┤
│ Tabla: Investigaciones recientes (sesiones) + [Nueva investigación] │
└─────────────────────────────────────────────────────────────────────┘
```

- The **alert feed** is the dashboard's reason to exist daily: each alert = severity tag + one-line fact + evidence chip + "Investigar →" (opens a new session pre-seeded with the alert context).
- "Nueva investigación" is the primary CTA everywhere — it opens the Workspace with the chat focused and 3 suggested prompts (recent entities, pending alerts, "Comparar dos administrados").

---

# 7. AgentOps Debugger view (trace)

Reachable from any attribution chip, any task row ("Ver detalle"), and the session menu ("¿Cómo se construyó esta respuesta?").

- **Side sheet** (not a separate page) sliding over the canvas, 560px: keeps context.
- Vertical spine = the plan steps; expanding a step shows tool calls as cards: tool name, params (pretty-printed, keys humanized), duration, result size, and retrieved evidence.
- A **"Verificación"** section at the bottom shows the guardrail outcome: claims checked, claims flagged/removed. This is the feature that wins institutional trust — make it visible, not buried.
- Admin extras (eval runs, RegressionTestAgent) live behind a role flag in this same sheet.
- Copy decision: in analyst mode the sheet is titled **"Trazabilidad"** (their word), not "Debugger" (our word). "AgentOps Debugger" remains the product/brand name for the hackathon, but in-product navigation uses domain language.

---

# 8. Branding & Visual Language

## 8.1 Direction

Institutional-environmental, evidence-driven. Reference points: Peruvian state digital guidelines (gob.pe sobriety) + the texture of legal documents (mono numerals, stamps, file tabs) — **not** a startup SaaS look, and not eco-kitsch (no leaves, no globes).

## 8.2 Palette

| Token | Hex | Use |
|---|---|---|
| `verde-fiscal` (primary) | `#0E5A47` | Primary actions, active nav, Coordinador accents |
| `verde-tinta` (ink) | `#16241F` | Headings, body text |
| `papel` (background) | `#F7F8F6` | App background (slight green-gray, not cream) |
| `superficie` | `#FFFFFF` | Cards, chat bubbles |
| `azul-dato` | `#1D6FA3` | Links, API-data accents, selected chart series |
| `ámbar-advertencia` | `#B45309` | Warnings, non-firm resolution badges |
| `rojo-crítico` | `#B42318` | Critical severity only (rare by design) |
| `gris-evidencia` | `#5B6661` | Captions, stamps, "datos al" labels |

Data palette for chart series (neutral, severity-free): `#0E5A47`, `#1D6FA3`, `#5B8C5A`, `#7A6FA3`, `#946B2D`, `#4A7C8C`.
Severity scale: Baja `#5B6661` · Media `#B45309` · Alta `#C2410C` · Crítica `#B42318` — always paired with icon (●▲▲!) and text label.

## 8.3 Typography

| Role | Face | Notes |
|---|---|---|
| Display / headings | **Archivo** (Google Fonts) | Chosen for the name and the fit: a grotesque designed for archival/institutional use. SemiBold for H1/H2, tight tracking. |
| Body / UI | **Source Sans 3** | High legibility at 14–15px, excellent Spanish diacritics. |
| Evidence / data | **IBM Plex Mono** | Resolution numbers, RUC, evidence chips, "datos al" stamps, table numerics. The mono treatment of legal identifiers is the typographic signature. |

Type scale: 13 / 14 / 16 / 20 / 25 / 31. Body 14px (data-dense product), reports render at 16px.

## 8.4 Iconography, shape, motion

- Icons: Lucide (ships with shadcn), 1.5px stroke, never filled except severity dots.
- Radius: 6px cards, 4px chips, 2px table cells — crisper than consumer-soft, fitting the institutional register.
- The **expediente tab motif**: canvas tabs are drawn as physical file tabs (top-edge trapezoid) — the single decorative signature, used nowhere else.
- Motion: 150–250ms ease-out only; checklist state changes animate (ring → check) because they carry meaning; charts fade in once; `prefers-reduced-motion` honored globally. No skeleton shimmer on chat — use the live-caption pattern instead.

## 8.5 Voice (es-PE)

- Sentence case everywhere ("Generar informe", not "GENERAR INFORME").
- Buttons say the outcome: "Aprobar y guardar informe", not "OK".
- Errors: cause + remedy, no apologies, no exclamation marks: "La API de OEFA no respondió (timeout). Se usaron datos en caché del 10/06/2026. [Reintentar]".
- The mandatory report disclaimer (spec §15) renders verbatim in the report footer and the export — fixed, non-editable, in Spanish and English.

---

# 9. Key States

| State | Treatment |
|---|---|
| Empty session | Centered prompt: "¿Qué deseas investigar?" + 3 suggested prompts + entity search field. Canvas shows a quiet "El panel se irá llenando con la evidencia de tu investigación." |
| First-run (no docs) | Documentos tab offers the preloaded corpus ("12 resoluciones de ejemplo cargadas") so the demo/MVP never feels hollow. |
| API down | Amber system notice in chat + amber "caché" stamp replacing "datos al" on every affected element. Nothing pretends to be live. |
| Long task (>60s) | Continues in background; nav session item gets a progress badge; on completion, toast + unread dot on the session. |
| Ambiguous entity | Clarification message with 2–4 candidate cards (name, RUC, sector) — never a silent guess. |
| Guardrail removed a claim | Footnote on the Result card: "1 afirmación se omitió por falta de evidencia. Ver Trazabilidad." Honesty as a feature. |
| Mobile (<768px) | Read-only: dashboard KPIs, alert feed, report view, session result summaries. Composer hidden; "Continúa esta investigación en escritorio". |

---

# 10. Accessibility & Quality floor

- WCAG 2.1 AA: all palette pairs above pass 4.5:1 on their assigned backgrounds; severity never encoded by color alone.
- Full keyboard path through chat → plan card actions → checklist → canvas tabs → evidence drawer; visible focus ring (`azul-dato`, 2px offset).
- Live regions: task checklist updates announced via `aria-live="polite"`; result card via `aria-live="assertive"` is too aggressive — keep polite.
- Charts: every Recharts visual paired with an accessible data table (toggle "Ver tabla"), which doubles as the CSV source.
- Targets ≥40px; popovers dismissible by Esc; drawer traps focus.

---

# 11. Component inventory (shadcn mapping — build order)

1. `AppShell` (nav rail, top bar) — shadcn `Sidebar`, `Breadcrumb`
2. `ChatThread` + message components: `PlanCard`, `TaskChecklist`, `ResultSummaryCard`, `ApprovalCard`, `ClarificationCard`, `SystemNotice`
3. `EvidenceChip` + `EvidenceDrawer` (Sheet)
4. `CanvasTabs` (Tabs, custom expediente styling), `KpiCard`, `StampLabel` ("datos al…")
5. `TimelineProcesal` (custom), chart wrappers `ChartCard` (title/unit/source/export/attribution)
6. `RecordsTable` (TanStack Table preset), `ReportView`, `TraceSheet`
7. Dashboard: `AlertFeed`, `SessionsTable`

---

# 12. Mockups

See **`agentops-debugger-mockups.html`** (open in a browser; screen switcher top-right):

1. **Espacio de trabajo** — chat with plan→checklist→result flow, canvas Resumen with timeline + charts + evidence drawer.
2. **Panel** — dashboard with KPIs, charts, alert feed.
3. **Informe** — read-only report with severity, evidence and disclaimer.

The mockups implement the palette, type, expediente tabs, chips, and state patterns described here and are intended as the visual contract for the frontend team.

---

*End of design specification.*
