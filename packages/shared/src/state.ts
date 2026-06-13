import { z } from 'zod';
import { ExecutionStatus, Id, IsoTimestamp } from './common.js';
import { ArtifactRecord } from './evidence.js';
import { LedgerEvent } from './ledger.js';
import { DomainTaskPacket, DomainTaskResult } from './tasks.js';

/** Structured conversation memory (architecture §11.1) — so long sessions
 *  reconstruct without replaying the whole transcript. */
export const TurnSummary = z.object({
  turnId: Id,
  userMessage: z.string(),
  summary: z.string(),
  timestamp: IsoTimestamp,
});
export type TurnSummary = z.infer<typeof TurnSummary>;

export const DecisionRecord = z.object({
  decision: z.string(),
  rationale: z.string(),
  timestamp: IsoTimestamp,
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

/** The suspend reason when the workflow pauses for HITL (architecture §11.2). */
export const InterruptState = z.object({
  interruptId: Id,
  reason: z.enum(['approval', 'clarification']),
  taskId: z.string().optional(),
});
export type InterruptState = z.infer<typeof InterruptState>;

/**
 * OrchestratorState — the single durable source of truth (architecture §11.1).
 * Each workflow step returns the fully assembled next state (replace-reducer
 * discipline, §11.3).
 */
export const OrchestratorState = z.object({
  runId: Id,
  threadId: Id,
  sessionId: Id,
  executionStatus: ExecutionStatus,

  workspace: z.object({
    domains: z.record(z.unknown()).default({}),
    sharedFacts: z.record(z.unknown()).default({}),
    entityRefs: z.record(z.string()).default({}), // name → RUC, etc.
  }),

  conversation: z.object({
    rollingSummary: z.string().default(''),
    turnSummaries: z.array(TurnSummary).default([]),
    entityIndex: z.record(z.string()).default({}),
    decisionLog: z.array(DecisionRecord).default([]),
  }),

  activeTask: DomainTaskPacket.optional(),
  pendingTasks: z.array(DomainTaskPacket).default([]),
  completedTasks: z.array(DomainTaskResult).default([]),

  artifacts: z.record(ArtifactRecord).default({}), // id → artifact
  ledger: z.array(LedgerEvent).default([]),

  interruptState: InterruptState.optional(),
  finalResponseDraft: z.string().optional(),
});
export type OrchestratorState = z.infer<typeof OrchestratorState>;

/**
 * A suspended-workflow snapshot persisted to Tablestore `workflow_snapshots`
 * (architecture §11.2) — the durable backing for Mastra suspend/resume across
 * HTTP requests.
 */
export const WorkflowSnapshot = z.object({
  sessionId: Id,
  resumeToken: z.string(),
  state: OrchestratorState,
  savedAt: IsoTimestamp,
});
export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshot>;
