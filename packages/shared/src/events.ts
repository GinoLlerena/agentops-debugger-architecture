import { z } from 'zod';
import { Id } from './common.js';
import { EvidenceItem } from './evidence.js';
import { ClarificationRequest, DomainTaskPacket } from './tasks.js';

/**
 * NormalizedUserRequest — what the web sends to the api (architecture §9.2).
 * Never carries secrets.
 */
export const NormalizedUserRequest = z.object({
  text: z.string(),
  sessionId: Id.optional(), // omitted → new session
  requestContext: z.record(z.unknown()).default({}), // e.g. seeded alert context
});
export type NormalizedUserRequest = z.infer<typeof NormalizedUserRequest>;

/**
 * Structured UI actions returned alongside text (architecture §3, §9.2):
 * "chat reflects info into the dashboard/canvas." The agent navigates for the
 * user; the UI shows a toast so navigation never feels haunted (UX §3).
 */
export const UiAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open_tab'), tab: z.enum(['resumen', 'datos', 'documentos', 'informe']) }),
  z.object({ action: z.literal('render_chart'), chartId: z.string(), artifactId: Id }),
  z.object({ action: z.literal('navigate'), to: z.string(), toastLabel: z.string().optional() }),
]);
export type UiAction = z.infer<typeof UiAction>;

/**
 * The single typed streaming event envelope (architecture §10, decision D10).
 * One vocabulary powers BOTH the live chat checklist and the post-hoc trace.
 */
export const StreamEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plan'),
    payload: z.object({
      reasoning: z.string(), // one short paragraph, plain Spanish (UX §4.4)
      tasks: z.array(DomainTaskPacket),
    }),
  }),
  z.object({
    type: z.literal('task_start'),
    payload: z.object({ taskId: Id, agentId: z.string(), title: z.string() }),
  }),
  z.object({
    type: z.literal('task_progress'),
    payload: z.object({
      taskId: Id,
      caption: z.string(), // live caption — names the real thing happening (UX §4.5)
      progress: z.number().min(0).max(1).optional(),
    }),
  }),
  z.object({
    type: z.literal('task_done'),
    payload: z.object({
      taskId: Id,
      status: z.enum(['completed', 'failed', 'skipped']),
      result: z.string(), // one-line result, not just "done"
    }),
  }),
  z.object({
    type: z.literal('clarification_required'),
    payload: ClarificationRequest,
  }),
  z.object({
    type: z.literal('approval_required'),
    payload: z.object({
      interruptId: Id,
      description: z.string(), // what will be done (HITL card)
      reportPreviewId: Id.optional(),
    }),
  }),
  z.object({
    type: z.literal('result'),
    payload: z.object({
      text: z.string(),
      uiActions: z.array(UiAction).default([]),
      evidence: z.array(EvidenceItem).default([]),
      resultSummary: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    payload: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

/** Discriminator literals, handy for exhaustive switches on the client. */
export const STREAM_EVENT_TYPES = [
  'plan',
  'task_start',
  'task_progress',
  'task_done',
  'clarification_required',
  'approval_required',
  'result',
  'error',
] as const;
