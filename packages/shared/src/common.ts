import { z } from 'zod';

/**
 * Shared primitives and domain enums used across every contract.
 * Spanish labels for legal terms of art are preserved verbatim (Reqs §7, L1–L2).
 */

/** Non-empty identifier string. */
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** ISO-8601 timestamp string (UTC), used for all stored/streamed times. */
export const IsoTimestamp = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;

/**
 * Domains a task can belong to — the left side of manifest routing
 * (`domain+operation → agentId`). See architecture §5.3, §6.
 */
export const Domain = z.enum([
  'routing', // Coordinator
  'oefa_data', // DataAgent
  'oefa_docs', // DocsAgent
  'report', // ReportAgent (draft)
  'report_admin', // ReportManager (persist/search)
  'eval', // Verifier (admin)
]);
export type Domain = z.infer<typeof Domain>;

/** Operations an agent can support (right side of routing). */
export const DomainOperation = z.enum([
  'plan',
  'search',
  'explain',
  'verify',
  'create',
  'update',
  'delete',
]);
export type DomainOperation = z.infer<typeof DomainOperation>;

/**
 * Confidence label attached to every finding/evidence item (FR-42).
 * UI encodes these with border style + text, never color alone.
 */
export const ConfidenceLabel = z.enum([
  'directa', // Evidencia directa
  'inferencia', // Inferencia
  'sin_evidencia', // Sin evidencia suficiente
]);
export type ConfidenceLabel = z.infer<typeof ConfidenceLabel>;

/**
 * Warning severity classification with explicit criteria (FR-33).
 */
export const WarningSeverity = z.enum(['Informativa', 'Advertencia', 'Crítica']);
export type WarningSeverity = z.infer<typeof WarningSeverity>;

/**
 * Risk/severity scale for the severity distribution chart and report risk level
 * (UX §6.2). Color-blind safe: always paired with icon + label in the UI.
 */
export const RiskSeverity = z.enum(['Baja', 'Media', 'Alta', 'Crítica']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

/**
 * Resolution status awareness (FR-04). The agent must warn when citing a
 * non-firm resolution. `firme` = consentida.
 */
export const ResolutionStatus = z.enum([
  'firme', // consentida
  'apelada',
  'anulada',
  'archivada',
  'en_proceso',
  'desconocido',
]);
export type ResolutionStatus = z.infer<typeof ResolutionStatus>;

/** Execution status of the orchestrator run / a task result. */
export const ExecutionStatus = z.enum(['running', 'waiting', 'completed', 'failed']);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

/** Result status a specialist agent can return for a task. */
export const TaskStatus = z.enum(['completed', 'failed', 'needs_user_input', 'skipped']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Whether an operation requires HITL approval before it takes effect (FR-44). */
export const ApprovalPolicy = z.enum(['none', 'required']);
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;

/** A typed, non-throwing error carried across boundaries ("errors are data"). */
export const DomainError = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean().default(false),
});
export type DomainError = z.infer<typeof DomainError>;

/** Geographic location at Peruvian administrative levels. */
export const PeruLocation = z.object({
  departamento: z.string().optional(),
  provincia: z.string().optional(),
  distrito: z.string().optional(),
});
export type PeruLocation = z.infer<typeof PeruLocation>;
