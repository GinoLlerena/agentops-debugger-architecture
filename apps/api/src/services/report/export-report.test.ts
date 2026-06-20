import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { EvidenceItem } from '@agentops/shared';
import { buildReport } from './build-report.js';
import { exportReport } from './export-report.js';
import type { CompanyStats } from '../oefa/oefa-service.js';

const stats: CompanyStats = {
  totalRecords: 3,
  withSanction: 3,
  sumFineUit: 450,
  sumFineSoles: 0,
  firmCount: 2,
  openCount: 1,
  reincidencia: true,
  sectors: ['Minería'],
  byYear: { '2023': 2 },
};
const evidence: EvidenceItem[] = [
  { id: 'OEFA:r1', documentTitle: 'Resolución N.° 1245-2023-OEFA/DFAI', passage: 'p', confidence: 'directa' },
];
const report = buildReport({
  id: 'report-x',
  sessionId: 's1',
  entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
  records: [],
  stats,
  evidence,
  question: 'antecedentes',
  source: 'API OEFA · RESOL-CON-MULTA-FIRME',
  coverage: '2019-2025',
  asOf: '2026-06-13T12:00:00.000Z',
  agentVersion: '0.1.0',
});

describe('exportReport', () => {
  it('produces a valid PDF (%PDF header)', async () => {
    const { buffer, contentType, filename } = await exportReport(report, 'pdf');
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(contentType).toBe('application/pdf');
    expect(filename).toBe('informe-report-x.pdf');
  });

  it('produces a valid DOCX (PK zip header)', async () => {
    const { buffer, contentType } = await exportReport(report, 'docx');
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(contentType).toContain('wordprocessingml');
  });

  it('produces a valid XLSX (PK zip header)', async () => {
    const { buffer, contentType } = await exportReport(report, 'xlsx');
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(contentType).toContain('spreadsheetml');
  });

  it('localizes an English report export (worksheet names + severity values)', async () => {
    const enReport = buildReport({
      id: 'report-en',
      sessionId: 's1',
      entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
      records: [],
      stats,
      evidence,
      question: 'background',
      source: 'API OEFA · RESOL-CON-MULTA-FIRME',
      coverage: '2019-2025',
      asOf: '2026-06-13T12:00:00.000Z',
      agentVersion: '0.1.0',
      language: 'en',
    });
    const { buffer } = await exportReport(enReport, 'xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Findings')).toBeDefined();
    expect(wb.getWorksheet('Warnings')).toBeDefined();
    // the critical warning's severity is rendered in English, not the stored 'Crítica'
    const warnings = wb.getWorksheet('Warnings')!;
    const severities = warnings.getColumn(2).values.map((v) => String(v));
    expect(severities).toContain('Critical');
    expect(severities).not.toContain('Crítica');
  });
});
