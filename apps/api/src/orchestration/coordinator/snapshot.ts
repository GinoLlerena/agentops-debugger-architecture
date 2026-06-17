import {
  ChartSpec,
  type ClarificationRequest,
  type EvidenceItem,
  type OrchestratorState,
  type SessionSnapshot,
  type SessionSnapshotPending,
} from '@agentops/shared';

/** Key under which {@link ingest} stashes the original request in sharedFacts. */
const REQUEST_KEY = 'originalRequest';

/** A generic clarification for a session that was suspended before the prompt was
 *  persisted (pre-`pendingClarification` sessions) — degrades gracefully. */
const FALLBACK_CLARIFICATION: ClarificationRequest = {
  question: 'Esta sesión quedó a la espera de una aclaración. Reformula tu consulta para continuar.',
  candidates: [{ id: 'reformular', label: 'Reformular la consulta' }],
};

/** All evidence gathered across the run, de-duped by id (last write wins). */
export function collectEvidence(state: OrchestratorState): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>();
  for (const t of state.completedTasks) for (const e of t.evidence) byId.set(e.id, e);
  return [...byId.values()];
}

/** `chart_data` artifacts validated into {@link ChartSpec}s (malformed skipped). */
export function collectCharts(state: OrchestratorState): ChartSpec[] {
  const out: ChartSpec[] = [];
  for (const a of Object.values(state.artifacts)) {
    if (a.kind !== 'chart_data') continue;
    const parsed = ChartSpec.safeParse(a.data);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** The drafted/saved report id for this run, if any (the `report_draft` artifact
 *  id is the report id — also used as the approval card's `reportPreviewId`). */
export function reportIdOf(state: OrchestratorState): string | undefined {
  return Object.values(state.artifacts).find((a) => a.kind === 'report_draft')?.id;
}

/**
 * Project the latest persisted {@link OrchestratorState} into a
 * {@link SessionSnapshot} the web app folds to rehydrate a reopened session.
 * Pure (no I/O). A `waiting` run yields the pending HITL card; a terminal run
 * yields the final answer text. Both carry the evidence/charts/report gathered.
 */
export function buildSessionSnapshot(state: OrchestratorState): SessionSnapshot {
  const request = state.workspace.sharedFacts[REQUEST_KEY] as { text?: string } | undefined;
  const reportId = reportIdOf(state);
  const base = {
    sessionId: state.sessionId,
    status: state.executionStatus,
    userMessage: request?.text ?? '',
    evidence: collectEvidence(state),
    charts: collectCharts(state),
    reportId,
  };

  if (state.executionStatus === 'waiting' && state.interruptState) {
    const it = state.interruptState;
    const pending: SessionSnapshotPending =
      it.reason === 'approval'
        ? {
            type: 'approval',
            interruptId: it.interruptId,
            description: state.activeTask?.title ?? 'Aprobación requerida',
            reportPreviewId: reportId,
          }
        : { type: 'clarification', request: state.pendingClarification ?? FALLBACK_CLARIFICATION };
    return { ...base, pending };
  }

  // terminal (completed/failed) → the final answer text
  return { ...base, finalText: state.finalResponseDraft };
}
