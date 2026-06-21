# Technical Review

Date: 2026-06-20

## Scope And Verification

Reviewed the monorepo source, tests, configuration, and docs. Existing checks are green:

- `pnpm -r test`: passed, 270 tests across shared, API, and web.
- `pnpm -r typecheck`: passed.
- `pnpm lint`: passed.

This review focuses on practical, incremental fixes. It does not recommend a rewrite.

## Repository Overview

The repository is a pnpm TypeScript monorepo:

- `packages/shared`: zod contracts and shared domain types. This is the cross-boundary source of truth for requests, stream events, orchestrator state, reports, OEFA records, charts, evidence, and sessions.
- `apps/api`: Hono API, dependency wiring, offline/live service adapters, OEFA data service, RAG service, orchestration coordinator, Mastra/Qwen agent wrappers, persistence adapters, and report export.
- `apps/web`: Vite React client with TanStack Query/Router, a streaming SSE reducer, workspace chat, canvas tabs, report view, evidence drawer, trace sheet, and i18n catalogs.
- `docs`: architecture, deployment, verification, demo, and source requirement documents.

The core architecture is sound for the current scope: contracts are shared, the API is dependency-injected, services are interface-backed, and the coordinator is well tested with offline fakes. The highest-value improvements are around edge-case correctness, validation at persistence/tool boundaries, and reducing duplicated deterministic agent/report logic.

## Findings

### 1. Direct-reply turns can keep stale canvas state

- Title: Direct replies do not clear previous charts, evidence, or report tabs.
- Category: Bug / UI state.
- Severity: Medium.
- Location: `apps/web/src/lib/agent-stream.ts:151`, `apps/web/src/lib/agent-stream.ts:229`, `apps/web/src/lib/use-agent.ts:81`.
- Problem: The reducer clears per-turn canvas state only when a `plan` event arrives. A planner can return `reply`, which emits `result` without a preceding `plan`. In that path, previous turn evidence, charts, `requestedTab`, and `reportId` remain in state.
- Why it matters: A user can ask a follow-up conceptual question and still see charts or a report from the previous investigation, which makes the UI misleading.
- Recommended fix: Clear per-turn canvas state when a new user turn starts in `send`, or introduce an explicit `turn_started` stream event. Add a reducer test where a populated state receives only `result` and `done`.
- Confidence level: High.

### 2. Locale number parsing misses dot-only thousands separators

- Title: Peruvian-style values like `1.584.000` parse as `undefined`.
- Category: Data correctness.
- Severity: Medium.
- Location: `apps/api/src/services/util/text.ts:35`.
- Problem: `parseLocaleNumber` treats dot-only input as a decimal form. A common Spanish/Peruvian thousands format such as `1.584.000` becomes `Number("1.584.000")`, which is `NaN`, so fines can be dropped during normalization.
- Why it matters: OEFA fine totals, charts, risk level, and reports can understate monetary exposure when live data uses dot thousand separators.
- Recommended fix: Detect repeated dot groups or a final 3-digit group as thousands separators before falling back to decimal-dot parsing. Add tests for `1.584.000`, `1.584,50`, `1584.50`, and negative/invalid cases.
- Confidence level: High.

### 3. Empty entity queries can match every company

- Title: Blank profile queries degrade into broad ambiguous matches.
- Category: Validation / edge case.
- Severity: Medium.
- Location: `apps/api/src/services/oefa/oefa-service.ts:271`, `packages/shared/src/events.ts:10`, `apps/api/src/http/server.ts:104`.
- Problem: `getCompanyProfile` trims the input but does not reject an empty string. Because `applyFilter` ignores falsy `administrado`, a blank query can match all records and return all distinct entities as ambiguous. `NormalizedUserRequest.text` also allows an empty string at the API contract level.
- Why it matters: This can create noisy clarification flows, slow calls on large datasets, and confusing API responses. The web avoids blank sends, but API and tool callers can still hit it.
- Recommended fix: Use `z.string().trim().min(1)` for user text and company query inputs. In `getCompanyProfile`, short-circuit blank queries to `not_found` or a typed validation error.
- Confidence level: High.

### 4. Fire-and-forget stream emits can race terminal events

- Title: Coordinator emits some SSE events without awaiting the write.
- Category: Streaming correctness.
- Severity: Medium.
- Location: `apps/api/src/orchestration/coordinator/coordinator.ts:266`, `apps/api/src/orchestration/coordinator/coordinator.ts:317`, `apps/api/src/orchestration/coordinator/coordinator.ts:370`, `apps/api/src/http/server.ts:166`.
- Problem: `applyResult` and `finalize` call `void emit(...)` for clarification, task completion, and final result. `streamTurn` then persists state and emits `done`. Because writes are async, `done` can race with `result` or `task_done`, especially under backpressure or slow clients.
- Why it matters: The frontend assumes stream order. A terminal `done` before the final `result` can produce transient failed/running state or missing UI artifacts.
- Recommended fix: Make `applyResult` async and await all progress emits in order. Keep swallowing disconnects inside `send`, but serialize writes from the coordinator.
- Confidence level: High.

### 5. Stored state is trusted without schema validation

- Title: Persistence reads bypass shared zod contracts.
- Category: Validation / data integrity.
- Severity: Medium.
- Location: `apps/api/src/persistence/session-store.ts:21`, `apps/api/src/persistence/report-store.ts:22`, `apps/api/src/orchestration/offline/offline-report-agents.ts:23`.
- Problem: `SessionStore.loadState` and `ReportStore.get` return typed values directly from the document store. The report agent also casts `record_set` artifact data without validating its payload shape.
- Why it matters: Live Tablestore data can be stale, manually edited, or written by an older version. One malformed stored state or artifact can break resume, report generation, or export.
- Recommended fix: Parse stored states and reports with `OrchestratorState.safeParse` and `Report.safeParse` at read boundaries. Add a small schema for `record_set` artifact data and validate before using it.
- Confidence level: High.

### 6. Approved report export cache assumes immutability but does not enforce it

- Title: Cached approved exports can become stale.
- Category: Persistence / report lifecycle.
- Severity: Medium.
- Location: `apps/api/src/services/report/report-exporter.ts:17`, `apps/api/src/services/report/report-exporter.ts:32`, `apps/api/src/persistence/report-store.ts:21`.
- Problem: `ReportExporter` caches approved files by `reports/{reportId}/informe.{ext}`. The comments say approved reports are immutable, but `ReportStore.save` can still overwrite the same report ID.
- Why it matters: If an approved report is corrected or migrated, exports may continue serving the old blob. This is a compliance and user-trust issue.
- Recommended fix: Enforce approved-report immutability in `ReportStore.save`, or include a version such as `updatedAt`/content hash in the export key. If mutation is allowed, invalidate old blobs explicitly.
- Confidence level: Medium-high.

### 7. RAG indexing is append-only and can duplicate documents

- Title: Re-indexing the same document ID appends duplicate chunks.
- Category: Fragile logic / scalability.
- Severity: Medium.
- Location: `apps/api/src/services/rag/retriever.ts:53`, `apps/api/src/services/rag/tools.ts:54`.
- Problem: `indexDocument` adds chunks to the lexical index and vector list every time. There is no replace, delete, or deduplication path for an existing document ID.
- Why it matters: Future upload/index endpoints can inflate retrieval scores, duplicate citations, and leak obsolete document content into answers.
- Recommended fix: Track document IDs to chunk IDs in `RagService`. For now, reject duplicate IDs or replace old chunks before adding new ones. Add tests that index the same ID twice and verify retrieval returns one set.
- Confidence level: High.

### 8. RAG tuning options are not guarded

- Title: Invalid chunk and hybrid-scoring options can break retrieval.
- Category: Missing validation.
- Severity: Low-medium.
- Location: `apps/api/src/services/rag/chunker.ts:22`, `apps/api/src/services/rag/chunker.ts:40`, `apps/api/src/services/rag/retriever.ts:39`.
- Problem: `chunkText` allows `overlapChars >= maxChars`, which makes the hard-split loop non-progressing. `vectorWeight` is documented as `0..1` but is not clamped or rejected.
- Why it matters: These are internal options today, but they are easy to misuse as indexing becomes configurable. A bad overlap can hang a request or startup.
- Recommended fix: Validate `maxChars > 0`, `overlapChars >= 0`, `overlapChars < maxChars`, and `0 <= vectorWeight <= 1` in constructors/helpers. Add unit tests.
- Confidence level: High.

### 9. Session summaries do not reflect report or entity progress

- Title: Session metadata remains mostly static.
- Category: Product data / maintainability.
- Severity: Low-medium.
- Location: `apps/api/src/persistence/session-store.ts:43`.
- Problem: `upsertSession` preserves `subjectEntity`, `lastResultSummary`, and `reportIds` from existing records, but does not derive them from the latest state. `messageCount` increments per persisted turn or resume, not necessarily per user-visible message.
- Why it matters: The dashboard can show sessions without reports, subjects, or useful summaries even after successful report generation. As features grow, callers may duplicate derivation logic elsewhere.
- Recommended fix: Derive metadata from `state.artifacts`, completed task summaries, and original request in one helper. Update tests for report IDs, subject entity, and resume behavior.
- Confidence level: High.

### 10. Live/offline deterministic agent logic is split across confusing names

- Title: Shared report/data builders live in `offline` modules and duplicate helpers.
- Category: Redundant code / responsibility.
- Severity: Low.
- Location: `apps/api/src/orchestration/offline/offline-agents.ts:111`, `apps/api/src/orchestration/offline/offline-report-agents.ts:16`, `apps/api/src/orchestration/agents/specialists.ts:201`.
- Problem: Live agents reuse `createOfflineReportAgent` and `createOfflineReportManager`, and both offline/live paths separately handle query translation, entity resolution, artifact materialization, and result construction.
- Why it matters: The behavior is intentionally shared, but the module names and helper duplication make it easy to change one path and miss the other.
- Recommended fix: Move deterministic report agents/builders to a neutral module such as `orchestration/agents/deterministic-report-agents.ts`. Extract a small shared helper for data query resolution and `mkResult`.
- Confidence level: High.

### 11. Report export repeats the same section traversal in three renderers

- Title: PDF, DOCX, and XLSX renderers duplicate report mapping logic.
- Category: Boilerplate / maintainability.
- Severity: Low.
- Location: `apps/api/src/services/report/export-report.ts:68`, `apps/api/src/services/report/export-report.ts:110`, `apps/api/src/services/report/export-report.ts:140`.
- Problem: Each export format independently walks findings, warnings, recommendations, sources, and metadata.
- Why it matters: Adding a report section or changing labels requires touching multiple renderers and tests. It is not a bug today, but it will create drift.
- Recommended fix: Build a small format-neutral `ReportExportViewModel` with ordered sections and rows. Keep format-specific rendering thin.
- Confidence level: High.

### 12. Runtime live integrations lack automated smoke gates

- Title: Tablestore, OSS, Junar live, and Mastra/Qwen paths are compile-tested but not smoke-tested.
- Category: Test coverage / operational risk.
- Severity: Medium.
- Location: `apps/api/src/services/storage/tablestore-client.ts`, `apps/api/src/services/storage/oss-client.ts`, `apps/api/src/orchestration/agents/specialists.ts:110`, `apps/api/src/orchestration/agents/planner.ts`.
- Problem: Unit tests are strong for offline behavior, but live SDK integration paths depend on credentials and are not covered by env-gated smoke tests or scripts.
- Why it matters: The most likely deployment failures are SDK shape, credential, table/bucket existence, model response shape, or endpoint mismatch. Those will not show up in normal CI.
- Recommended fix: Add optional `pnpm test:integration` scripts that run only when required env vars are present. Cover `createStores`, one Junar page fetch, one Qwen structured planner call, and one OSS put/get/delete.
- Confidence level: High.

### 13. Public deployment has no access boundary

- Title: Sessions, reports, trace, and exports are unauthenticated.
- Category: Architecture / security posture.
- Severity: Medium for public deployments, low for local demos.
- Location: `apps/api/src/http/server.ts:81`, `apps/api/src/http/server.ts:87`, `apps/api/src/http/server.ts:118`, `apps/api/src/http/server.ts:143`.
- Problem: All session, trace, report, and export endpoints are open. The data sources are public, but generated investigations and reports may still be sensitive.
- Why it matters: If deployed as a public demo or shared environment, anyone with a session/report ID can read traces or export reports.
- Recommended fix: Before public deployment, add a minimal access boundary: demo token middleware, per-session unguessable IDs plus signed access, or an auth provider. Keep it behind a simple Hono middleware so local offline mode remains frictionless.
- Confidence level: Medium.

### 14. Documentation describes a broader API than the server exposes

- Title: Architecture docs and implementation surface have drifted.
- Category: Documentation / architecture communication.
- Severity: Low-medium.
- Location: `docs/IMPLEMENTATION_PLAN.md:194`, `docs/files/agentops-debugger-architecture.md:329`, `apps/api/src/http/server.ts:81`.
- Problem: The docs mention `/documents`, `/rag/index`, broader sessions CRUD, `/messages`, and report search. The current server implements a smaller subset.
- Why it matters: This is fine for phased delivery, but stale docs create false expectations for reviewers, users, and future contributors.
- Recommended fix: Add an "Implemented API surface" table to README or `docs/VERIFY.md`, marking planned endpoints separately from implemented ones.
- Confidence level: High.

## Redundant Or Duplicated Code To Simplify

- `mkResult` helpers appear in both offline data/docs agents and report agents. A small shared helper would reduce drift.
- Live mode imports deterministic report agents from `offline-report-agents`, which is behaviorally correct but misleading. Rename or move the shared deterministic agents.
- Report export repeats section mapping across PDF, DOCX, and XLSX. Extract a simple export view model before adding more report sections.
- Data artifact resolution is mostly shared but still has parallel live/offline branches. Keep the LLM narration separate, but centralize query/entity/artifact materialization.

## Architecture And Responsibility Notes

- The project has a good boundary between contracts, services, orchestration, and UI. Preserve that.
- The next scaling risk is not the coordinator itself; it is the persistence boundary. Stored state should be treated as external input and parsed back through shared schemas.
- RAG is intentionally in-memory now. Before user-uploaded documents or long-running sessions, add document replacement/deletion semantics and persistence strategy.
- The report lifecycle needs one explicit policy: immutable once approved, or mutable with versions. Current export caching implicitly assumes immutability.
- The docs are ambitious and useful, but should distinguish implemented endpoints from planned phase work.

## Prioritized Action Plan

### P0 - Fix misleading or correctness-affecting behavior

1. Clear per-turn web canvas state for direct-reply turns and add reducer coverage.
2. Fix `parseLocaleNumber` for dot-only thousands separators and add tests.
3. Validate blank user/entity queries at shared contract and service boundaries.
4. Await coordinator stream emits in order so `result` cannot race `done`.

### P1 - Harden live/runtime data boundaries

5. Parse persisted `OrchestratorState` and `Report` records on read.
6. Validate `record_set` artifact payloads before report generation.
7. Decide and enforce approved report immutability or versioned exports.
8. Add env-gated smoke tests for Junar, Qwen/Mastra, Tablestore, and OSS.

### P2 - Improve maintainability without broad rewrites

9. Move deterministic report agents out of `offline` naming and share result helpers.
10. Add duplicate/replacement semantics to RAG indexing before exposing document upload broadly.
11. Extract a small report export view model before adding more export sections.
12. Update docs to show implemented versus planned API endpoints.

