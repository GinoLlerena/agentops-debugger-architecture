import {
  Report,
  type EvidenceItem,
  type Finding,
  type OefaRecord,
  type Recommendation,
  type RiskSeverity,
  type Warning,
} from '@agentops/shared';
import type { CompanyStats } from '../oefa/oefa-service.js';

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
}

function riskLevel(stats: CompanyStats): RiskSeverity {
  if (stats.reincidencia && stats.firmCount >= 2) return 'Crítica';
  if (stats.reincidencia || stats.openCount > 0) return 'Alta';
  if (stats.withSanction > 0) return 'Media';
  return 'Baja';
}

export function buildReport(input: BuildReportInput): Report {
  const { entity, stats, evidence } = input;
  const evidenceIds = evidence.map((e) => e.id);
  const issueDate = new Date(input.asOf).toLocaleDateString('es-PE');

  const findings: Finding[] = [
    {
      id: 'F1',
      statement:
        `${entity.administrado} registra ${stats.totalRecords} acto(s) administrativo(s), ` +
        `de los cuales ${stats.firmCount} corresponden a resoluciones firmes; ` +
        `la exposición acumulada asciende a ${stats.sumFineUit} UIT.`,
      evidenceIds,
      confidence: evidenceIds.length > 0 ? 'directa' : 'sin_evidencia',
    },
  ];
  if (stats.reincidencia) {
    findings.push({
      id: 'F2',
      statement: `Se identifica reincidencia en las infracciones imputadas al administrado.`,
      evidenceIds,
      confidence: 'directa',
    });
  }

  const warnings: Warning[] = [];
  if (stats.reincidencia) {
    warnings.push({
      id: 'W1',
      severity: 'Crítica',
      statement: 'Patrón de reincidencia detectado; mayor probabilidad de agravantes.',
      evidenceIds,
    });
  }
  if (stats.openCount > 0) {
    warnings.push({
      id: 'W2',
      severity: 'Advertencia',
      statement: `${stats.openCount} resolución(es) no firme(s) (en proceso o apeladas); el estado puede cambiar.`,
      evidenceIds,
    });
  }

  const recommendations: Recommendation[] = [
    {
      id: 'R1',
      text: 'Se recomienda revisar los instrumentos de gestión ambiental y el cumplimiento de las medidas correctivas dictadas.',
      rationale: 'Reduce la exposición a nuevas imputaciones y agravantes por reincidencia.',
      sourceIds: evidenceIds,
    },
  ];

  const documents = [...new Set(evidence.map((e) => e.documentTitle))];

  return Report.parse({
    id: input.id,
    sessionId: input.sessionId,
    template: 'antecedentes',
    status: 'draft',
    title: `Informe de Antecedentes Ambientales — ${entity.administrado}`,
    subjectEntity: { name: entity.administrado, ruc: entity.ruc },
    periodAnalyzed: input.coverage
      ? { from: input.coverage.split('-')[0], to: input.coverage.split('-')[1] }
      : undefined,
    issueDate,
    confidentialityLabel: 'Confidencial',
    executiveSummary: {
      keyFindings: findings.map((f) => f.statement),
      riskLevel: riskLevel(stats),
      topRecommendations: recommendations.map((r) => r.text),
    },
    scopeAndMethodology: {
      questionsAddressed: [input.question],
      sourcesConsulted: [input.source, ...documents],
      consultationDates: [issueDate],
      limitations: [
        'Basado en información pública a la fecha de consulta; el estado de las resoluciones puede cambiar.',
      ],
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
