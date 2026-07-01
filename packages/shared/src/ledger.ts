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

/**
 * Who/what originated an action. All fields optional: until authentication lands,
 * only `ip` (captured at the HTTP boundary) is populated; `id`/`role` are the
 * non-breaking fill-in once there are authenticated users (the hinge to real
 * attribution/tenancy). Never carries credentials.
 */
export const Actor = z.object({
  id: z.string().optional(),
  role: z.string().optional(),
  ip: z.string().optional(),
});
export type Actor = z.infer<typeof Actor>;

export const LedgerEvent = z.object({
  seq: z.number().int().nonnegative(), // ordering within a session
  sessionId: Id,
  runId: z.string().optional(),
  type: LedgerEventType,
  timestamp: IsoTimestamp,
  agentId: z.string().optional(), // attribution
  taskId: z.string().optional(),
  actor: Actor.optional(), // originator (ip now; id/role once auth lands)
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
