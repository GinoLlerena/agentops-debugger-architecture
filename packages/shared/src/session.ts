import { z } from 'zod';
import { ExecutionStatus, Id, IsoTimestamp, Language, DEFAULT_LANGUAGE } from './common.js';
import { ChartSpec } from './chart.js';
import { EvidenceItem } from './evidence.js';
import { SubjectEntity } from './report.js';
import { ClarificationRequest } from './tasks.js';

/** A compact summary pinned to the top of the canvas Resumen tab (UX §4.6). */
export const ResultSummary = z.object({
  title: z.string(),
  stats: z.array(z.string()).max(3).default([]), // ≤3 lines of stats
  keyFinding: z.string().optional(),
  riskLevel: z.string().optional(),
  evidenceCount: z.number().int().nonnegative().default(0),
});
export type ResultSummary = z.infer<typeof ResultSummary>;

/**
 * Session — an "investigación" / expediente (UX §3). The canvas remembers state;
 * the chat is a derived log.
 */
export const Session = z.object({
  id: Id,
  title: z.string(),
  status: z.enum(['active', 'archived']).default('active'),
  subjectEntity: SubjectEntity.optional(),
  lastResultSummary: ResultSummary.optional(),
  reportIds: z.array(Id).default([]),
  messageCount: z.number().int().nonnegative().default(0),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type Session = z.infer<typeof Session>;

/**
 * SessionSnapshot — a chat-shaped projection of the latest persisted
 * {@link OrchestratorState}, returned by `GET /sessions/:id/snapshot` so the
 * Workspace can **rehydrate** when a session is reopened (instead of starting
 * blank). It restores the latest turn: the user's question, the evidence/charts
 * gathered, the final answer (terminal runs) or the pending HITL card (a
 * `waiting` run, which the user can then resume). The per-task checklist is not
 * replayed — the Trazabilidad trace (`/trace`) already reproduces the steps.
 */
export const SessionSnapshotPending = z.discriminatedUnion('type', [
  z.object({ type: z.literal('clarification'), request: ClarificationRequest }),
  z.object({
    type: z.literal('approval'),
    interruptId: Id,
    description: z.string(),
    reportPreviewId: Id.optional(),
  }),
]);
export type SessionSnapshotPending = z.infer<typeof SessionSnapshotPending>;

export const SessionSnapshot = z.object({
  sessionId: Id,
  status: ExecutionStatus,
  /** The language the run was executed in, so rehydration renders consistently. */
  language: Language.default(DEFAULT_LANGUAGE),
  userMessage: z.string(),
  evidence: z.array(EvidenceItem).default([]),
  charts: z.array(ChartSpec).default([]),
  reportId: Id.optional(),
  /** The final answer text — present only for terminal (completed/failed) runs. */
  finalText: z.string().optional(),
  /** The HITL card to render — present only while the run is `waiting`. */
  pending: SessionSnapshotPending.optional(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;
