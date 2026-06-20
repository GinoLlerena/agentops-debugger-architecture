import { z } from 'zod';
import { ConfidenceLabel, Id, IsoTimestamp, Language } from './common.js';

/**
 * EvidenceItem — the signature atom (UX §4.7). Every claim in the UI carries at
 * least one of these as a citation chip. A claim with no evidence renders a
 * visible "sin fuente" chip rather than hiding the gap.
 *
 * `documentTitle`/`passage` always hold the *rendered* text in the response
 * language. When that text was translated from the source, the Spanish original
 * is preserved in the `*Original` sidecars (+ `originalLanguage`) so the UI can
 * offer "show original" — citations stay faithful to the legal source.
 */
export const EvidenceItem = z.object({
  id: Id, // e.g. "E1"
  documentTitle: z.string(),
  documentTitleOriginal: z.string().optional(), // source-language title, if translated
  resolutionNumber: z.string().optional(), // e.g. "Resolución N.° 1245-2023-OEFA/DFAI"
  page: z.number().int().positive().optional(),
  paragraph: z.string().optional(), // e.g. "considerando 7"
  date: z.string().optional(), // DD/MM/AAAA as it appears in the source
  sourceUrl: z.string().url().optional(), // "Abrir documento original (p. N)"
  passage: z.string(), // the cited text (≤2 lines shown in popover)
  passageOriginal: z.string().optional(), // source-language passage, if translated
  originalLanguage: Language.optional(), // language of the *Original fields
  confidence: ConfidenceLabel,
  producedByAgentId: z.string().optional(), // attribution chip → trace
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/** Kinds of artifact the orchestrator/agents persist (architecture §4.1, §11.1). */
export const ArtifactKind = z.enum([
  'fact',
  'plan',
  'tool_result',
  'evidence',
  'record_set', // normalized OefaRecord[]
  'chart_data',
  'report_draft',
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

/**
 * ArtifactRecord — a typed, addressable artifact referenced by findings.
 * `data` is intentionally a passthrough payload (validated by the producer's own
 * schema); the envelope here is what the ledger and findings reference by id.
 */
export const ArtifactRecord = z.object({
  id: Id,
  kind: ArtifactKind,
  producedByAgentId: z.string(),
  createdAt: IsoTimestamp,
  summary: z.string().optional(), // human-readable one-liner for the trace
  data: z.unknown(), // typed by the producer; opaque at this boundary
});
export type ArtifactRecord = z.infer<typeof ArtifactRecord>;

/**
 * A finding = statement + the evidence that backs it. The orchestration-layer
 * guardrail (FR-41) drops/flags any finding whose evidenceIds resolve to nothing.
 */
export const Finding = z.object({
  id: Id,
  statement: z.string(),
  evidenceIds: z.array(Id), // may be empty → guardrail flags as sin_evidencia
  confidence: ConfidenceLabel,
});
export type Finding = z.infer<typeof Finding>;
