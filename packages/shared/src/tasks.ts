import { z } from 'zod';
import {
  ApprovalPolicy,
  Domain,
  DomainError,
  DomainOperation,
  Id,
  TaskStatus,
} from './common.js';
import { ArtifactRecord, EvidenceItem, Finding } from './evidence.js';

/**
 * DomainTaskPacket — one unit of work the Coordinator emits in its plan
 * (architecture §4.2, §5). The Coordinator sets `domain`/`operation`; the route
 * step fills `agentId` via manifest lookup.
 */
export const DomainTaskPacket = z.object({
  taskId: Id,
  domain: Domain,
  operation: DomainOperation,
  title: z.string(), // Spanish, shown in the Plan card / checklist
  instruction: z.string(), // natural-language instruction for the specialist agent
  inputs: z.record(z.unknown()).default({}),
  dependsOn: z.array(Id).default([]),
  agentId: z.string().optional(), // filled by routeStep
  approvalPolicy: ApprovalPolicy.optional(),
});
export type DomainTaskPacket = z.infer<typeof DomainTaskPacket>;

/** A candidate offered when an entity is ambiguous (FR-clarification, UX §4.3). */
export const ClarificationCandidate = z.object({
  id: Id,
  label: z.string(), // administrado name
  ruc: z.string().optional(),
  sector: z.string().optional(),
  note: z.string().optional(),
});
export type ClarificationCandidate = z.infer<typeof ClarificationCandidate>;

/** A clarification request raised by an agent → suspends the workflow. */
export const ClarificationRequest = z.object({
  question: z.string(),
  candidates: z.array(ClarificationCandidate).min(1),
});
export type ClarificationRequest = z.infer<typeof ClarificationRequest>;

/**
 * DomainTaskResult — what a specialist agent returns. Carries artifacts,
 * findings+evidence, optional follow-on tasks (`nextTasks`-as-data,
 * architecture §4.1), a clarification, and typed errors/warnings.
 */
export const DomainTaskResult = z.object({
  taskId: Id,
  agentId: z.string(),
  status: TaskStatus,
  summary: z.string(), // one-line result (not just "done")
  artifacts: z.array(ArtifactRecord).default([]),
  findings: z.array(Finding).default([]),
  evidence: z.array(EvidenceItem).default([]),
  nextTasks: z.array(DomainTaskPacket).default([]),
  clarification: ClarificationRequest.optional(),
  errors: z.array(DomainError).default([]),
  warnings: z.array(z.string()).default([]),
});
export type DomainTaskResult = z.infer<typeof DomainTaskResult>;
