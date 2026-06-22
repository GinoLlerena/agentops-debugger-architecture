import { z } from 'zod';
import { Id, IsoTimestamp } from './common.js';

/**
 * LedgerEvent — the append-only audit trail that powers BOTH the live task
 * checklist and the post-hoc "Trazabilidad" trace (architecture §13). One event
 * vocabulary serves both views (DRY). Retained ≥5 years for audit (NFR-02).
 */
export const LedgerEventType = z.enum([
  'turn_opened',
  'plan_created',
  'task_routed',
  'task_started',
  'tool_called',
  'llm_call',
  'evidence_attached',
  'guardrail_drop',
  'clarification_required',
  'approval_required',
  'approval_granted',
  'task_done',
  'report_saved',
  'warning',
  'error',
]);
export type LedgerEventType = z.infer<typeof LedgerEventType>;

export const LedgerEvent = z.object({
  seq: z.number().int().nonnegative(), // ordering within a session
  sessionId: Id,
  runId: z.string().optional(),
  type: LedgerEventType,
  timestamp: IsoTimestamp,
  agentId: z.string().optional(), // attribution
  taskId: z.string().optional(),
  /**
   * Event-specific payload. For `tool_called`: { tool, params, durationMs,
   * resultSize }. For `llm_call`: { role, model, inputTokens, outputTokens,
   * totalTokens, durationMs } (token usage + latency for cost observability).
   * For `guardrail_drop`: { statement, reason }. Pretty-printed and key-humanized
   * in the trace sheet. Never contains secrets (no auth_key, no API keys).
   */
  payload: z.record(z.unknown()).default({}),
});
export type LedgerEvent = z.infer<typeof LedgerEvent>;
