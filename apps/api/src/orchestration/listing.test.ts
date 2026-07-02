import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { detectListingIntent, runListingTask, MAX_LISTING_CANDIDATES } from './listing.js';
import { InMemoryOefaCache } from '../services/oefa/oefa-cache.js';
import { OefaService, SeedRecordSource } from '../services/oefa/oefa-service.js';

const NOW = new Date('2026-07-02T12:00:00Z');

function rec(p: Partial<OefaRecord> & { id: string; administrado: string }): OefaRecord {
  return OefaRecord.parse({
    sourceDatasetId: 'resoluciones-multa-firmes',
    sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
    fetchedAt: '2026-06-13T12:00:00.000Z',
    coverage: '2019-2025',
    ...p,
  });
}

const SEED: OefaRecord[] = [
  rec({ id: 'a1', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', actoAdministrativoDate: '10/02/2023', fineAmountUit: 300, resolutionStatus: 'firme' }),
  rec({ id: 'a2', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', actoAdministrativoDate: '05/06/2021', fineAmountUit: 100, resolutionStatus: 'apelada' }),
  rec({ id: 'b1', administrado: 'Refinería La Pampilla S.A.A.', ruc: '20100123456', actoAdministrativoDate: '15/09/2020', fineAmountUit: 50, resolutionStatus: 'firme' }),
  rec({ id: 'c1', administrado: 'Pesquera Andina S.A.C.', ruc: '20600987654', actoAdministrativoDate: '20/03/2025', fineAmountUit: 20, resolutionStatus: 'en_proceso' }),
];

function service(records: OefaRecord[] = SEED) {
  return new OefaService(new SeedRecordSource(records), new InMemoryOefaCache());
}

const listingTask = {
  taskId: 'data',
  domain: 'oefa_data' as const,
  operation: 'search' as const,
  title: 't',
  instruction: 'i',
  inputs: { query: 'lístame las entidades sancionadas' },
  dependsOn: [],
};

describe('detectListingIntent', () => {
  it.each([
    ['Lístame las entidades sancionadas este año', { yearFrom: 2026, yearTo: 2026 }],
    ['lístame las empresas multadas en 2023', { yearFrom: 2023, yearTo: 2023 }],
    ['Muestra el listado de administrados sancionados entre 2019 y 2021', { yearFrom: 2019, yearTo: 2021 }],
    ['Lístame las entidades sancionadas en los últimos 5 años', { yearFrom: 2022, yearTo: 2026 }],
    ['¿Cuáles son las empresas sancionadas el año pasado?', { yearFrom: 2025, yearTo: 2025 }],
    ['Enumera los administrados sancionados', {}],
    ['List the sanctioned companies this year', { yearFrom: 2026, yearTo: 2026 }],
    ['Which entities were fined in the last 3 years?', { yearFrom: 2024, yearTo: 2026 }],
    ['Show me the penalized firms', {}],
  ])('detects "%s"', (q, expected) => {
    expect(detectListingIntent(q, NOW)).toEqual(expected);
  });

  it.each([
    '¿Qué sanciones tiene bambas?',
    'Antecedentes del administrado con RUC 20543210981',
    'Genera un informe de antecedentes de Minera Las Bambas',
    'Muestra las sanciones de La Pampilla', // sanctions of ONE entity — no plural entity noun
    'Lístame las entidades sancionadas del RUC 20543210981', // a RUC always means one entity
    'What is the UIT value?',
  ])('does NOT trigger on "%s"', (q) => {
    expect(detectListingIntent(q, NOW)).toBeUndefined();
  });
});

describe('runListingTask', () => {
  it('lists distinct entities as clickable candidates, most-sanctioned first (es)', async () => {
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service(),
      intent: {},
      language: 'es',
    });
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification).toBeDefined();
    const c = result.clarification!;
    expect(c.question).toContain('3 administrado(s)');
    expect(c.question).toContain('¿Cuál deseas investigar?');
    expect(c.candidates.map((x) => x.label)).toEqual([
      'Minera Las Bambas S.A.', // 2 records — sorted first
      'Refinería La Pampilla S.A.A.',
      'Pesquera Andina S.A.C.',
    ]);
    // The candidate id is the RUC — clicking resumes the entity cycle with it.
    expect(c.candidates[0]!.id).toBe('20543210981');
    expect(c.candidates[0]!.note).toBe('2 registro(s)');
  });

  it('filters by the year range and names it in the question', async () => {
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service(),
      intent: { yearFrom: 2023, yearTo: 2023 },
      language: 'es',
    });
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification!.question).toContain('en 2023');
    expect(result.clarification!.candidates).toHaveLength(1);
    expect(result.clarification!.candidates[0]!.label).toBe('Minera Las Bambas S.A.');
  });

  it('falls back to all entities with an honest note when the range is empty', async () => {
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service(),
      intent: { yearFrom: 2026, yearTo: 2026 },
      language: 'es',
    });
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification!.question).toContain('No encontré sanciones registradas en 2026');
    expect(result.clarification!.candidates).toHaveLength(3);
  });

  it('caps the candidates and says so', async () => {
    const many = Array.from({ length: MAX_LISTING_CANDIDATES + 3 }, (_, i) =>
      rec({
        id: `m${i}`,
        administrado: `Empresa ${i} S.A.`,
        ruc: String(20100000000 + i),
        actoAdministrativoDate: '10/02/2023',
        resolutionStatus: 'firme',
      }),
    );
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service(many),
      intent: {},
      language: 'es',
    });
    expect(result.clarification!.candidates).toHaveLength(MAX_LISTING_CANDIDATES);
    expect(result.clarification!.question).toContain(`Muestro las ${MAX_LISTING_CANDIDATES}`);
  });

  it('localizes the question to English', async () => {
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service(),
      intent: { yearFrom: 2020, yearTo: 2023 },
      language: 'en',
    });
    expect(result.clarification!.question).toContain('in 2020–2023');
    expect(result.clarification!.question).toContain('Which one do you want to investigate?');
  });

  it('completes with the no-evidence message when there are no records at all', async () => {
    const result = await runListingTask({
      task: listingTask,
      agentId: 'data-agent',
      oefa: service([]),
      intent: {},
      language: 'es',
    });
    expect(result.status).toBe('completed');
    expect(result.summary).toBe('No encontré evidencia en las fuentes consultadas.');
    expect(result.clarification).toBeUndefined();
  });
});
