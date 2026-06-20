import { describe, expect, it } from 'vitest';
import {
  OefaRecord,
  type NormalizedUserRequest,
  type OrchestratorState,
} from '@agentops/shared';
import { createOfflineDataAgent, createOfflinePlanner } from './offline-agents.js';
import { InMemoryOefaCache } from '../../services/oefa/oefa-cache.js';
import { OefaService, SeedRecordSource } from '../../services/oefa/oefa-service.js';
import type { AgentRunContext } from '../coordinator/types.js';

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
];

const req = (text: string, language: 'es' | 'en'): NormalizedUserRequest => ({
  text,
  language,
  requestContext: {},
});

function ctx(language: 'es' | 'en'): AgentRunContext {
  return {
    state: { language } as unknown as OrchestratorState,
    artifacts: {},
    onProgress: () => {},
  };
}

const dataTask = {
  taskId: 'data',
  domain: 'oefa_data' as const,
  operation: 'search' as const,
  title: 't',
  instruction: 'i',
  inputs: { query: 'RUC 20543210981' },
  dependsOn: [],
};

describe('offline planner — localized', () => {
  it('emits Spanish task titles + reasoning by default', async () => {
    const plan = await createOfflinePlanner().plan({ request: req('antecedentes', 'es'), state: {} as OrchestratorState });
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.tasks[0]!.title).toBe('Buscar registros del administrado');
    expect(plan.reasoning).toContain('historial de cumplimiento');
  });

  it('emits English task titles + reasoning when language is en', async () => {
    const plan = await createOfflinePlanner().plan({ request: req('background', 'en'), state: {} as OrchestratorState });
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.tasks[0]!.title).toBe('Search the regulated entity’s records');
    expect(plan.reasoning).toContain('compliance history');
  });

  it('recognizes an English report-intent query (Flow A: report + save tasks)', async () => {
    const plan = await createOfflinePlanner().plan({
      request: req('Generate a background report for RUC 20543210981', 'en'),
      state: {} as OrchestratorState,
    });
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.tasks.map((t) => t.taskId)).toEqual(['data', 'docs', 'report', 'save']);
    expect(plan.reasoning).toContain('request your approval');
  });
});

describe('offline data agent — localized narrative', () => {
  function service() {
    return new OefaService(new SeedRecordSource(SEED), new InMemoryOefaCache());
  }

  it('produces an English finding + summary when state.language is en', async () => {
    const result = await createOfflineDataAgent(service()).run(dataTask, ctx('en'));
    expect(result.status).toBe('completed');
    expect(result.findings[0]!.statement).toContain('administrative act');
    expect(result.summary).toMatch(/records for .* \(\d+ final\)\./);
    // evidence passage stays in the source language (Spanish) — translated in 5G-c
    expect(result.evidence[0]!.passage).toContain('Estado:');
  });

  it('produces a Spanish finding by default', async () => {
    const result = await createOfflineDataAgent(service()).run(dataTask, ctx('es'));
    expect(result.findings[0]!.statement).toContain('acto(s) administrativo(s)');
  });
});
