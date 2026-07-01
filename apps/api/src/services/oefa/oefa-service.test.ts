import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { InMemoryOefaCache } from './oefa-cache.js';
import {
  computeStats,
  OefaService,
  SeedRecordSource,
  type FetchedRecords,
  type OefaRecordSource,
} from './oefa-service.js';

function rec(partial: Partial<OefaRecord> & { id: string; administrado: string }): OefaRecord {
  return OefaRecord.parse({
    sourceDatasetId: 'resoluciones-multa-firmes',
    sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
    fetchedAt: '2026-06-13T12:00:00.000Z',
    coverage: '2019-2025',
    ...partial,
  });
}

const SEED: OefaRecord[] = [
  rec({ id: 'a1', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '10/02/2023', fineAmountUit: 300, fineAmountSoles: 1_485_000, resolutionStatus: 'firme', reincidencia: true }),
  rec({ id: 'a2', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '05/06/2021', fineAmountUit: 100, fineAmountSoles: 440_000, resolutionStatus: 'apelada', reincidencia: true }),
  rec({ id: 'b1', administrado: 'Minera Bambas Servicios S.A.C.', ruc: '20601234567', sector: 'Minería', actoAdministrativoDate: '15/09/2022', fineAmountUit: 50, fineAmountSoles: 230_000, resolutionStatus: 'firme' }),
  rec({ id: 'c1', administrado: 'Pesquera Pacífico Sur S.A.', ruc: '20777777777', sector: 'Pesca', actoAdministrativoDate: '01/03/2020', fineAmountUit: 40, resolutionStatus: 'en_proceso' }),
];

class ThrowingSource implements OefaRecordSource {
  async fetchRecords(): Promise<FetchedRecords> {
    throw new Error('OEFA caído');
  }
}

describe('OefaService.searchRecords', () => {
  const service = new OefaService(new SeedRecordSource(SEED));

  it('filters by sector', async () => {
    const { records } = await service.searchRecords({ sector: 'Pesca' });
    expect(records.map((r) => r.id)).toEqual(['c1']);
  });

  it('filters by year range', async () => {
    const { records } = await service.searchRecords({ yearFrom: 2022, yearTo: 2023 });
    expect(new Set(records.map((r) => r.id))).toEqual(new Set(['a1', 'b1']));
  });

  it('filters by RUC exactly', async () => {
    const { records } = await service.searchRecords({ ruc: '20543210981' });
    expect(records).toHaveLength(2);
  });
});

describe('OefaService.getCompanyProfile (entity resolution)', () => {
  const service = new OefaService(new SeedRecordSource(SEED));

  it('returns a profile with stats when resolved by RUC', async () => {
    const result = await service.getCompanyProfile('20543210981');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profile.entity.administrado).toBe('Minera Las Bambas S.A.');
    expect(result.profile.stats.totalRecords).toBe(2);
    expect(result.profile.stats.sumFineUit).toBe(400);
    expect(result.profile.stats.reincidencia).toBe(true);
  });

  it('flags ambiguous names with candidates instead of guessing', async () => {
    const result = await service.getCompanyProfile('bambas');
    expect(result.status).toBe('ambiguous');
    if (result.status !== 'ambiguous') return;
    expect(result.candidates).toHaveLength(2);
    expect(new Set(result.candidates.map((c) => c.ruc))).toEqual(
      new Set(['20543210981', '20601234567']),
    );
  });

  it('returns not_found for an unknown entity', async () => {
    const result = await service.getCompanyProfile('Empresa Inexistente S.A.');
    expect(result.status).toBe('not_found');
  });
});

describe('OefaService cache fallback (FR-14)', () => {
  it('serves cached records stamped fromCache when the source fails', async () => {
    const cache = new InMemoryOefaCache();
    const warm = new OefaService(new SeedRecordSource(SEED), cache);
    const fresh = await warm.getRecords();
    expect(fresh.fromCache).toBe(false);

    const broken = new OefaService(new ThrowingSource(), cache);
    const served = await broken.getRecords();
    expect(served.fromCache).toBe(true);
    expect(served.records).toHaveLength(SEED.length);
    expect(served.records.every((r) => r.fromCache)).toBe(true);
  });

  it('propagates the error when there is no cache to fall back on', async () => {
    const broken = new OefaService(new ThrowingSource());
    await expect(broken.getRecords()).rejects.toThrow(/OEFA caído/);
  });

  it('a capped fetch (e.g. deep-health maxRows:1) never clobbers the full cached copy', async () => {
    const cache = new InMemoryOefaCache();
    const warm = new OefaService(new SeedRecordSource(SEED), cache);
    await warm.getRecords(); // full fetch → cached
    await warm.getRecords(undefined, { maxRows: 1 }); // health-probe-shaped fetch

    const broken = new OefaService(new ThrowingSource(), cache);
    const served = await broken.getRecords();
    expect(served.records).toHaveLength(SEED.length); // still the full copy
  });

  it('a capped fetch does not populate an empty cache', async () => {
    const cache = new InMemoryOefaCache();
    const warm = new OefaService(new SeedRecordSource(SEED), cache);
    await warm.getRecords(undefined, { maxRows: 1 });

    const broken = new OefaService(new ThrowingSource(), cache);
    await expect(broken.getRecords()).rejects.toThrow(/OEFA caído/);
  });

  it('preserves the partial flag across the cache round-trip (FR-12)', async () => {
    class PartialSource implements OefaRecordSource {
      async fetchRecords(): Promise<FetchedRecords> {
        return { records: SEED, total: 999, partial: true };
      }
    }
    const cache = new InMemoryOefaCache();
    await new OefaService(new PartialSource(), cache).getRecords();

    const broken = new OefaService(new ThrowingSource(), cache);
    const served = await broken.getRecords();
    expect(served.partial).toBe(true);
  });

  it('a capped serve from cache is labeled partial', async () => {
    const cache = new InMemoryOefaCache();
    await new OefaService(new SeedRecordSource(SEED), cache).getRecords();

    const broken = new OefaService(new ThrowingSource(), cache);
    const served = await broken.getRecords(undefined, { maxRows: 1 });
    expect(served.records).toHaveLength(1);
    expect(served.partial).toBe(true);
  });
});

describe('computeStats', () => {
  it('aggregates fines, statuses, sectors, and per-year counts', () => {
    const stats = computeStats(SEED);
    expect(stats.totalRecords).toBe(4);
    expect(stats.sumFineUit).toBe(490);
    expect(stats.firmCount).toBe(2);
    expect(stats.openCount).toBe(2); // apelada + en_proceso
    expect(new Set(stats.sectors)).toEqual(new Set(['Minería', 'Pesca']));
    expect(stats.byYear['2023']).toBe(1);
  });
});
