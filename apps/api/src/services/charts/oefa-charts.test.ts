import { describe, expect, it } from 'vitest';
import { ChartSpec, OefaRecord } from '@agentops/shared';
import { buildOefaCharts } from './oefa-charts.js';

function rec(over: Partial<OefaRecord> & { id: string }): OefaRecord {
  return OefaRecord.parse({
    administrado: 'Minera Las Bambas S.A.',
    sourceDatasetId: 'resoluciones-multa-firmes',
    sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
    fetchedAt: '2026-06-13T12:00:00.000Z',
    ...over,
  });
}

const ctx = {
  source: 'API OEFA · resoluciones-multa-firmes',
  coverage: '2019-2025',
  asOf: '2026-06-13T12:00:00.000Z',
  producedByAgentId: 'data-agent',
  entityLabel: 'Minera Las Bambas S.A.',
};

describe('buildOefaCharts', () => {
  const records = [
    rec({ id: 'a', actoAdministrativoDate: '10/02/2023', fineAmountUit: 300, resolutionStatus: 'firme' }),
    rec({ id: 'b', actoAdministrativoDate: '05/06/2021', fineAmountUit: 100, resolutionStatus: 'apelada' }),
    rec({ id: 'c', actoAdministrativoDate: '15/09/2023', fineAmountUit: 50, resolutionStatus: 'firme' }),
  ];

  it('returns schema-valid chart specs', () => {
    const charts = buildOefaCharts(records, ctx);
    expect(charts.length).toBeGreaterThan(0);
    for (const c of charts) expect(ChartSpec.safeParse(c).success).toBe(true);
  });

  it('builds a per-year UIT bar chart (summing fines by year, sorted)', () => {
    const bar = buildOefaCharts(records, ctx).find((c) => c.kind === 'bar')!;
    expect(bar.unit).toBe('UIT');
    expect(bar.series).toEqual([
      { label: '2021', value: 100 },
      { label: '2023', value: 350 },
    ]);
    expect(bar.source).toContain('API OEFA');
  });

  it('builds a status distribution and a chronological timeline', () => {
    const charts = buildOefaCharts(records, ctx);
    const sev = charts.find((c) => c.kind === 'severity')!;
    expect(sev.series.find((p) => p.category === 'firme')!.value).toBe(2);

    const timeline = charts.find((c) => c.kind === 'timeline')!;
    expect(timeline.series.map((p) => p.date)).toEqual(['05/06/2021', '10/02/2023', '15/09/2023']);
  });

  it('returns no charts for an empty record set', () => {
    expect(buildOefaCharts([], ctx)).toEqual([]);
  });
});
