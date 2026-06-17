import { describe, expect, it } from 'vitest';
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
});
