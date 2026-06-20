import { describe, expect, it } from 'vitest';
import { MANDATORY_DISCLAIMER, Report, type EvidenceItem } from '@agentops/shared';
import { buildReport, type BuildReportInput } from './build-report.js';
import type { CompanyStats } from '../oefa/oefa-service.js';

const stats: CompanyStats = {
  totalRecords: 4,
  withSanction: 3,
  sumFineUit: 450,
  sumFineSoles: 2_227_500,
  firmCount: 3,
  openCount: 1,
  reincidencia: true,
  sectors: ['Minería'],
  byYear: { '2023': 2 },
};

const evidence: EvidenceItem[] = [
  { id: 'OEFA:r1', documentTitle: 'Resolución N.° 1245-2023-OEFA/DFAI', passage: 'p', confidence: 'directa' },
];

const input: BuildReportInput = {
  id: 'report-1',
  sessionId: 's1',
  entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
  records: [],
  stats,
  evidence,
  question: '¿Qué antecedentes tiene Minera Las Bambas?',
  source: 'API OEFA · RESOL-CON-MULTA-FIRME',
  coverage: '2019-2025',
  asOf: '2026-06-13T12:00:00.000Z',
  agentVersion: '0.1.0',
};

describe('buildReport', () => {
  it('produces a schema-valid antecedentes report with the mandatory disclaimer', () => {
    const report = buildReport(input);
    expect(Report.safeParse(report).success).toBe(true);
    expect(report.template).toBe('antecedentes');
    expect(report.status).toBe('draft');
    expect(report.disclaimer).toBe(MANDATORY_DISCLAIMER);
    expect(report.subjectEntity.ruc).toBe('20543210981');
  });

  it('escalates risk and emits warnings for reincidencia + open processes', () => {
    const report = buildReport(input);
    expect(report.executiveSummary.riskLevel).toBe('Crítica'); // reincidencia + firmCount>=2
    expect(report.warnings.some((w) => w.severity === 'Crítica')).toBe(true); // reincidencia
    expect(report.warnings.some((w) => w.statement.includes('no firme'))).toBe(true); // openCount
  });

  it('every finding cites evidence; recommendations are separate + advisory', () => {
    const report = buildReport(input);
    expect(report.findings.every((f) => f.evidenceIds.length > 0)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0]!.text.toLowerCase()).toContain('recomienda');
  });

  it('marks the headline finding sin_evidencia when there is no evidence', () => {
    const report = buildReport({ ...input, evidence: [] });
    expect(report.findings[0]!.confidence).toBe('sin_evidencia');
  });

  it('localizes the report to English when requested (content + date + tag)', () => {
    const report = buildReport({ ...input, language: 'en' });
    expect(Report.safeParse(report).success).toBe(true);
    expect(report.language).toBe('en');
    expect(report.title).toContain('Environmental Background Report');
    expect(report.findings[0]!.statement).toContain('administrative act');
    expect(report.warnings.some((w) => w.statement.includes('non-final resolution'))).toBe(true);
    expect(report.recommendations[0]!.text).toContain('recommended');
    expect(report.confidentialityLabel).toBe('Confidential');
    // en-US date (M/D/YYYY) rather than es-PE (D/M/YYYY)
    expect(report.issueDate).toBe(new Date(input.asOf).toLocaleDateString('en-US'));
    // severity enum value stays the canonical stored key (not translated)
    expect(report.executiveSummary.riskLevel).toBe('Crítica');
  });
});
