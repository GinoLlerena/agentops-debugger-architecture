import {
  DEFAULT_LANGUAGE,
  Report,
  type EvidenceItem,
  type Finding,
  type Language,
  type OefaRecord,
  type Recommendation,
  type RiskSeverity,
  type Warning,
} from '@agentops/shared';
import type { CompanyStats } from '../oefa/oefa-service.js';
import { messages } from '../../i18n/messages.js';

/** BCP-47 locale for the report's issue/consultation dates. */
const LOCALES: Record<Language, string> = { es: 'es-PE', en: 'en-US' };

/**
 * Build a structured "Informe de Antecedentes Ambientales" from the evidence the
 * Data and Docs agents produced (Reqs §6.2). Deterministic — the regulated
 * content (findings, warnings, recommendations, disclaimer) is assembled here,
 * not free-form by an LLM. Recommendations are advisory and separated from
 * findings; the mandatory disclaimer is fixed.
 */
export interface BuildReportInput {
  id: string;
  sessionId: string;
  entity: { administrado: string; ruc?: string };
  records: OefaRecord[];
  stats: CompanyStats;
  evidence: EvidenceItem[];
  question: string;
  source: string; // "API OEFA · RESOL-CON-MULTA-FIRME"
  coverage?: string;
  asOf: string; // ISO
  agentVersion: string;
  language?: Language;
}

function riskLevel(stats: CompanyStats): RiskSeverity {
  if (stats.reincidencia && stats.firmCount >= 2) return 'Crítica';
  if (stats.reincidencia || stats.openCount > 0) return 'Alta';
  if (stats.withSanction > 0) return 'Media';
  return 'Baja';
}

export function buildReport(input: BuildReportInput): Report {
  const { entity, stats, evidence } = input;
  const language = input.language ?? DEFAULT_LANGUAGE;
  const m = messages(language);
  const evidenceIds = evidence.map((e) => e.id);
  const issueDate = new Date(input.asOf).toLocaleDateString(LOCALES[language]);

  const findings: Finding[] = [
    {
      id: 'F1',
      statement: m.findingExposure({
        administrado: entity.administrado,
        total: stats.totalRecords,
        firm: stats.firmCount,
        uit: stats.sumFineUit,
      }),
      evidenceIds,
      confidence: evidenceIds.length > 0 ? 'directa' : 'sin_evidencia',
    },
  ];
  if (stats.reincidencia) {
    findings.push({
      id: 'F2',
      statement: m.findingReincidencia,
      evidenceIds,
      confidence: 'directa',
    });
  }

  const warnings: Warning[] = [];
  if (stats.reincidencia) {
    warnings.push({
      id: 'W1',
      severity: 'Crítica',
      statement: m.warningReincidencia,
      evidenceIds,
    });
  }
  if (stats.openCount > 0) {
    warnings.push({
      id: 'W2',
      severity: 'Advertencia',
      statement: m.warningOpen(stats.openCount),
      evidenceIds,
    });
  }

  const recommendations: Recommendation[] = [
    {
      id: 'R1',
      text: m.recommendationText,
      rationale: m.recommendationRationale,
      sourceIds: evidenceIds,
    },
  ];

  const documents = [...new Set(evidence.map((e) => e.documentTitle))];

  return Report.parse({
    id: input.id,
    sessionId: input.sessionId,
    template: 'antecedentes',
    status: 'draft',
    language,
    title: m.reportTitle(entity.administrado),
    subjectEntity: { name: entity.administrado, ruc: entity.ruc },
    periodAnalyzed: input.coverage
      ? { from: input.coverage.split('-')[0], to: input.coverage.split('-')[1] }
      : undefined,
    issueDate,
    confidentialityLabel: m.confidential,
    executiveSummary: {
      keyFindings: findings.map((f) => f.statement),
      riskLevel: riskLevel(stats),
      topRecommendations: recommendations.map((r) => r.text),
    },
    scopeAndMethodology: {
      questionsAddressed: [input.question],
      sourcesConsulted: [input.source, ...documents],
      consultationDates: [issueDate],
      limitations: [m.limitation],
    },
    findings,
    warnings,
    recommendations,
    sourcesAnnex: {
      documents,
      apiQueries: [`${input.source}${entity.ruc ? ` · RUC ${entity.ruc}` : ''}`],
      consultationDates: [issueDate],
    },
    versions: { agentVersion: input.agentVersion },
    createdAt: input.asOf,
    updatedAt: input.asOf,
  });
}
