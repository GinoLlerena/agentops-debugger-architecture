import {
  Report,
  type LedgerEvent,
  type OefaRecord,
  type OrchestratorState,
  type ResultSummary,
  type Session,
  type SubjectEntity,
} from '@agentops/shared';
import { COLLECTIONS, type DocumentStore } from '../services/storage/index.js';

/**
 * Persistence for orchestrator runs (architecture §11.2). The full
 * `OrchestratorState` IS our suspend snapshot — persisting it on every turn makes
 * suspend/resume durable across HTTP requests (the `/resume` endpoint loads it).
 * A lightweight `Session` record is maintained alongside for listing.
 */
export class SessionStore {
  constructor(
    private readonly docs: DocumentStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async saveState(state: OrchestratorState): Promise<void> {
    await this.docs.put(COLLECTIONS.snapshots, state.sessionId, state);
    await this.upsertSession(state);
  }

  async loadState(sessionId: string): Promise<OrchestratorState | undefined> {
    return this.docs.get<OrchestratorState>(COLLECTIONS.snapshots, sessionId);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.docs.get<Session>(COLLECTIONS.sessions, sessionId);
  }

  async listSessions(limit?: number): Promise<Session[]> {
    // Sort by recency BEFORE truncating — applying the limit at the store level
    // would slice by id order and return the wrong subset.
    const docs = await this.docs.list<Session>(COLLECTIONS.sessions);
    const sorted = docs.map((d) => d.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return limit != null ? sorted.slice(0, limit) : sorted;
  }

  /** The execution trace for a session = its ledger (architecture §13). */
  async getTrace(sessionId: string): Promise<LedgerEvent[] | undefined> {
    const state = await this.loadState(sessionId);
    return state?.ledger;
  }

  private async upsertSession(state: OrchestratorState): Promise<void> {
    const now = this.clock().toISOString();
    const existing = await this.getSession(state.sessionId);
    const requestText =
      (state.workspace.sharedFacts.originalRequest as { text?: string } | undefined)?.text ?? '';
    // Derive subject/reports/summary from the latest state so the dashboard
    // reflects what a session actually investigated and produced. Fall back to
    // the existing record so a turn that produced nothing (e.g. a clarification)
    // doesn't wipe a prior subject/summary.
    const derived = deriveSessionMeta(state);
    const session: Session = {
      id: state.sessionId,
      title: existing?.title ?? deriveTitle(requestText),
      status: 'active',
      subjectEntity: derived.subjectEntity ?? existing?.subjectEntity,
      lastResultSummary: derived.lastResultSummary ?? existing?.lastResultSummary,
      reportIds: [...new Set([...(existing?.reportIds ?? []), ...derived.reportIds])],
      // One save == one turn (a start or a resume); increment rather than derive
      // from turnSummaries, which the coordinator does not yet populate.
      messageCount: (existing?.messageCount ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.docs.put(COLLECTIONS.sessions, state.sessionId, session);
  }
}

/**
 * Derive listing metadata from the latest orchestrator state: the report ids it
 * drafted, the administrado under investigation, and a compact last-result line.
 * Pure; returns `undefined` fields when the turn produced nothing so the caller
 * can preserve prior values.
 */
function deriveSessionMeta(state: OrchestratorState): {
  subjectEntity?: SubjectEntity;
  reportIds: string[];
  lastResultSummary?: ResultSummary;
} {
  const artifacts = Object.values(state.artifacts);
  const reportIds = artifacts.filter((a) => a.kind === 'report_draft').map((a) => a.id);

  // Subject: prefer the drafted report (authoritative), else the resolved record set.
  let subjectEntity: SubjectEntity | undefined;
  const draft = artifacts.find((a) => a.kind === 'report_draft');
  const report = draft ? Report.safeParse(draft.data) : undefined;
  if (report?.success) {
    subjectEntity = report.data.subjectEntity;
  } else {
    const recordSet = artifacts.find((a) => a.kind === 'record_set');
    const rec = (recordSet?.data as { records?: OefaRecord[] } | undefined)?.records?.[0];
    if (rec) subjectEntity = { name: rec.administrado, ruc: rec.ruc };
  }

  // Last result: a compact line from the final answer + a deduped evidence count.
  let lastResultSummary: ResultSummary | undefined;
  const text = state.finalResponseDraft?.trim();
  if (text) {
    const ids = new Set<string>();
    for (const t of state.completedTasks) for (const e of t.evidence) ids.add(e.id);
    lastResultSummary = {
      title: subjectEntity?.name ?? 'Resultado',
      stats: [],
      keyFinding: text.length > 140 ? `${text.slice(0, 139)}…` : text,
      evidenceCount: ids.size,
    };
  }

  return { subjectEntity, reportIds, lastResultSummary };
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Investigación sin título';
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
