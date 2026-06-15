import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { OefaService, SeedRecordSource } from './oefa-service.js';
import { createOefaTools } from './tools.js';

const SEED = [
  OefaRecord.parse({
    id: 's1',
    administrado: 'Minera Los Andes S.A.',
    ruc: '20543210981',
    sector: 'Minería',
    actoAdministrativoDate: '10/02/2023',
    fineAmountUit: 300,
    resolutionStatus: 'firme',
    sourceDatasetId: 'resoluciones-multa-firmes',
    sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
    fetchedAt: '2026-06-13T12:00:00.000Z',
  }),
];

const tools = createOefaTools(new OefaService(new SeedRecordSource(SEED)));
const byId = (id: string) => tools.find((t) => t.id === id)!;

describe('OEFA tool descriptors', () => {
  it('exposes the four expected tools', () => {
    expect(tools.map((t) => t.id).sort()).toEqual([
      'fetch_oefa_dataset',
      'get_company_oefa_profile',
      'list_oefa_datasets',
      'search_oefa_records',
    ]);
  });

  it('each tool produces output that satisfies its declared output schema', async () => {
    const list = byId('list_oefa_datasets');
    expect(list.outputSchema.safeParse(await list.execute({})).success).toBe(true);

    const fetchT = byId('fetch_oefa_dataset');
    const fetched = await fetchT.execute({ datasetKey: 'resolucionesMultaFirmes' });
    expect(fetchT.outputSchema.safeParse(fetched).success).toBe(true);

    const search = byId('search_oefa_records');
    const searched = await search.execute({ sector: 'Minería' });
    expect(search.outputSchema.safeParse(searched).success).toBe(true);

    const profile = byId('get_company_oefa_profile');
    const resolved = await profile.execute({ query: '20543210981' });
    expect(profile.outputSchema.safeParse(resolved).success).toBe(true);
    expect((resolved as { status: string }).status).toBe('ok');
  });

  it('input schema rejects an unknown datasetKey', () => {
    const fetchT = byId('fetch_oefa_dataset');
    expect(fetchT.inputSchema.safeParse({ datasetKey: 'nope' }).success).toBe(false);
  });
});
