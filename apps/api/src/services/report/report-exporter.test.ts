import { describe, expect, it } from 'vitest';
import type { EvidenceItem, Report } from '@agentops/shared';
import { buildReport } from './build-report.js';
import { ReportExporter } from './report-exporter.js';
import { InMemoryBlobStore } from '../storage/in-memory-store.js';
import { reportFileKey } from '../storage/keys.js';
import type { CompanyStats } from '../oefa/oefa-service.js';

const stats: CompanyStats = {
  totalRecords: 1,
  withSanction: 1,
  sumFineUit: 100,
  sumFineSoles: 0,
  firmCount: 1,
  openCount: 0,
  reincidencia: false,
  sectors: ['Minería'],
  byYear: { '2023': 1 },
};
const evidence: EvidenceItem[] = [
  { id: 'OEFA:r1', documentTitle: 'Resolución N.° 1245-2023', passage: 'p', confidence: 'directa' },
];
const draft = buildReport({
  id: 'report-x',
  sessionId: 's1',
  entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
  records: [],
  stats,
  evidence,
  question: 'antecedentes',
  source: 'API OEFA',
  coverage: '2019-2025',
  asOf: '2026-06-13T12:00:00.000Z',
  agentVersion: '0.1.0',
});
const approved: Report = { ...draft, status: 'approved' };

describe('ReportExporter (blob-store read-through cache → OSS on the runtime path)', () => {
  it('renders an approved report and persists it to the blob store', async () => {
    const blobs = new InMemoryBlobStore();
    const file = await new ReportExporter(blobs).export(approved, 'pdf');

    expect(file.buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(file.filename).toBe('informe-report-x.pdf');
    // the file is now on the runtime path: stored under the canonical key
    expect(await blobs.exists(reportFileKey('report-x', 'pdf'))).toBe(true);
  });

  it('serves an approved report from the blob store without re-rendering', async () => {
    const blobs = new InMemoryBlobStore();
    // Pre-seed the canonical object with sentinel bytes; a cache hit must return
    // exactly these (proving the stored object is served, not a fresh render).
    const sentinel = new TextEncoder().encode('CACHED-OBJECT');
    await blobs.put(reportFileKey('report-x', 'pdf'), sentinel, { contentType: 'application/pdf' });

    const file = await new ReportExporter(blobs).export(approved, 'pdf');
    expect(file.buffer.toString('latin1')).toBe('CACHED-OBJECT');
    expect(file.contentType).toBe('application/pdf');
  });

  it('renders a draft fresh and does NOT cache it (drafts are mutable)', async () => {
    const blobs = new InMemoryBlobStore();
    const file = await new ReportExporter(blobs).export(draft, 'pdf');

    expect(file.buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(await blobs.exists(reportFileKey('report-x', 'pdf'))).toBe(false);
  });
});
