import { z } from 'zod';
import { Id, IsoTimestamp, RiskSeverity, WarningSeverity } from './common.js';
import { Finding } from './evidence.js';

/**
 * The mandatory, non-editable bilingual disclaimer (Reqs §6.2.9, architecture
 * §14). Renders verbatim in the report footer and every export. Do not edit.
 */
export const MANDATORY_DISCLAIMER = `Este informe se basa en información pública disponible a la fecha de consulta y no constituye asesoría legal. El estado de las resoluciones puede cambiar (apelación, anulación, reconsideración). Verifique con su asesor legal antes de tomar decisiones.

This report is based on public information as of the consultation date and does not constitute legal advice. Resolution statuses may change (appeal, annulment, reconsideration). Verify with your legal counsel before making decisions.`;

/** Report templates (Reqs §6.1, minimum set). */
export const ReportTemplate = z.enum([
  'antecedentes', // Informe de Antecedentes Ambientales
  'precedentes', // Informe de Precedentes
  'monitoreo', // Reporte de Monitoreo (watchlist digest)
  'resumen_resolucion', // Resumen Ejecutivo de Resolución
]);
export type ReportTemplate = z.infer<typeof ReportTemplate>;

export const ReportStatus = z.enum(['draft', 'approved', 'archived']);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const SubjectEntity = z.object({
  name: z.string(),
  ruc: z.string().optional(),
});
export type SubjectEntity = z.infer<typeof SubjectEntity>;

export const Warning = z.object({
  id: Id,
  severity: WarningSeverity,
  statement: z.string(),
  evidenceIds: z.array(Id).default([]),
});
export type Warning = z.infer<typeof Warning>;

export const Recommendation = z.object({
  id: Id,
  text: z.string(), // advisory/conditional language (FR-34)
  rationale: z.string(),
  sourceIds: z.array(Id).default([]),
});
export type Recommendation = z.infer<typeof Recommendation>;

/** A visualization reference embedded in a report section (Reqs §6.2.5). */
export const ReportVisualization = z.object({
  id: Id,
  type: z.string(), // chart catalog id, e.g. "C1" timeline, "C2" bars
  title: z.string(), // the question it answers
  artifactId: Id, // chart-data artifact
});
export type ReportVisualization = z.infer<typeof ReportVisualization>;

/** Fuentes y metodología annex (FR-32). */
export const SourcesAnnex = z.object({
  documents: z.array(z.string()).default([]),
  apiQueries: z.array(z.string()).default([]),
  consultationDates: z.array(z.string()).default([]),
});
export type SourcesAnnex = z.infer<typeof SourcesAnnex>;

/** Versions recorded for reproducibility (NFR-09). */
export const ReportVersions = z.object({
  agentVersion: z.string(),
  promptVersion: z.string().optional(),
  indexVersion: z.string().optional(),
  model: z.string().optional(),
});
export type ReportVersions = z.infer<typeof ReportVersions>;

/**
 * Report — the structured report following the mandatory skeleton (Reqs §6.2).
 * Findings carry evidence; warnings carry severity; recommendations are kept
 * separate from findings in advisory language.
 */
export const Report = z.object({
  id: Id,
  sessionId: Id,
  template: ReportTemplate,
  status: ReportStatus.default('draft'),

  // 1. Carátula
  title: z.string(),
  subjectEntity: SubjectEntity,
  periodAnalyzed: z.object({ from: z.string(), to: z.string() }).partial().optional(),
  issueDate: z.string(), // DD/MM/AAAA
  confidentialityLabel: z.string().optional(),

  // 2. Resumen ejecutivo (≤1 page)
  executiveSummary: z.object({
    keyFindings: z.array(z.string()).default([]),
    riskLevel: RiskSeverity,
    topRecommendations: z.array(z.string()).default([]),
  }),

  // 3. Alcance y metodología
  scopeAndMethodology: z.object({
    questionsAddressed: z.array(z.string()).default([]),
    sourcesConsulted: z.array(z.string()).default([]),
    consultationDates: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
  }),

  // 4. Hallazgos
  findings: z.array(Finding).default([]),

  // 5. Visualizaciones
  visualizations: z.array(ReportVisualization).default([]),

  // 6. Advertencias
  warnings: z.array(Warning).default([]),

  // 7. Recomendaciones
  recommendations: z.array(Recommendation).default([]),

  // 8. Anexo de fuentes
  sourcesAnnex: SourcesAnnex,

  // 9. Descargo de responsabilidad (fixed)
  disclaimer: z.literal(MANDATORY_DISCLAIMER).default(MANDATORY_DISCLAIMER),

  versions: ReportVersions,
  exportUrls: z
    .object({ pdf: z.string().url(), docx: z.string().url(), xlsx: z.string().url() })
    .partial()
    .optional(),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type Report = z.infer<typeof Report>;
