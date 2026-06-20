import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { buildDataArtifacts, entityQueryFor } from './data-artifacts.js';
import { computeStats } from '../services/oefa/oefa-service.js';

function rec(partial: Partial<OefaRecord> & { id: string; administrado: string }): OefaRecord {
  return OefaRecord.parse({
    sourceDatasetId: 'resoluciones-multa-firmes',
    sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
    fetchedAt: '2026-06-13T12:00:00.000Z',
    coverage: '2019-2025',
    ...partial,
  });
}

const RECORDS: OefaRecord[] = [
  rec({ id: 'a1', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '10/02/2023', fineAmountUit: 300, resolutionStatus: 'firme' }),
  rec({ id: 'a2', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '05/06/2021', fineAmountUit: 100, resolutionStatus: 'apelada' }),
  rec({ id: 'b1', administrado: 'Minera Bambas Servicios S.A.C.', ruc: '20601234567', sector: 'Minería', actoAdministrativoDate: '15/09/2022', fineAmountUit: 50, resolutionStatus: 'firme' }),
];

const LAS_BAMBAS = RECORDS.filter((r) => r.ruc === '20543210981');

describe('entityQueryFor', () => {
  it('returns an 11-digit RUC only when it matches a known record', () => {
    expect(entityQueryFor('antecedentes RUC 20543210981', RECORDS)).toBe('20543210981');
    // unknown 11-digit run is NOT treated as a RUC → falls through to name/text
    expect(entityQueryFor('expediente 99999999999 bambas', RECORDS)).toBe('bambas');
  });

  it('picks the longest query token present in an administrado name', () => {
    expect(entityQueryFor('historial servicios bambas', RECORDS)).toBe('servicios');
  });

  it('falls back to the raw question when nothing matches', () => {
    expect(entityQueryFor('xyz', RECORDS)).toBe('xyz');
  });
});

describe('buildDataArtifacts', () => {
  const stats = computeStats(LAS_BAMBAS);
  const artifacts = buildDataArtifacts({
    entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
    records: LAS_BAMBAS,
    stats,
    source: 'API OEFA · resoluciones-multa-firmes',
    coverage: '2019-2025',
    asOf: '2026-06-13T12:00:00.000Z',
    producedByAgentId: 'data-agent',
  });

  it('emits the record_set first, keyed by RUC, carrying records + stats', () => {
    const recordSet = artifacts[0]!;
    expect(recordSet.kind).toBe('record_set');
    expect(recordSet.id).toBe('records:20543210981');
    expect((recordSet.data as { records: OefaRecord[] }).records).toHaveLength(2);
    expect((recordSet.data as { stats: typeof stats }).stats).toEqual(stats);
  });

  it('emits chart_data artifacts the canvas can render', () => {
    const charts = artifacts.filter((a) => a.kind === 'chart_data');
    expect(charts.length).toBeGreaterThan(0);
    expect(charts.every((c) => c.producedByAgentId === 'data-agent')).toBe(true);
  });
});
