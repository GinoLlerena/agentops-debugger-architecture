import { describe, expect, it } from 'vitest';
import {
  OefaRecord,
  type NormalizedUserRequest,
  type OrchestratorState,
} from '@agentops/shared';
import { createOfflineDataAgent, createOfflinePlanner } from './offline-agents.js';
import { InMemoryOefaCache } from '../../services/oefa/oefa-cache.js';
import { OefaService, SeedRecordSource } from '../../services/oefa/oefa-service.js';
import type { Translator } from '../../services/translation/index.js';
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

  it('translates an English free-text query to Spanish before entity resolution', async () => {
    // The injected translator maps the English ask to a RUC the seed resolves;
    // without translation (Noop) the same English text resolves to nothing.
    const translator: Translator = {
      async translate(text) {
        return text === 'fines for the mining company' ? 'RUC 20543210981' : text;
      },
    };
    const enQuery = {
      ...dataTask,
      inputs: { query: 'fines for the mining company' },
    };
    const translated = await createOfflineDataAgent(service(), translator).run(enQuery, ctx('en'));
    expect(translated.status).toBe('completed');
    expect(translated.findings[0]!.statement).toContain('Minera Las Bambas');

    // control: no translator (offline Noop) → the English query resolves nothing
    const untranslated = await createOfflineDataAgent(service()).run(enQuery, ctx('en'));
    expect(untranslated.findings).toHaveLength(0);
  });

  it('uses a clarification answer verbatim (never translated)', async () => {
    const translator: Translator = {
      async translate() {
        throw new Error('clarification answer must not be translated');
      },
    };
    const task = { ...dataTask, inputs: { clarificationAnswer: '20543210981' } };
    const result = await createOfflineDataAgent(service(), translator).run(task, ctx('en'));
    expect(result.status).toBe('completed');
    expect(result.findings[0]!.statement).toContain('Minera Las Bambas');
  });
});

describe('listing intent — the clickable entity list cycle', () => {
  const NOW = () => new Date('2026-07-02T12:00:00Z');

  function service() {
    return new OefaService(new SeedRecordSource(SEED), new InMemoryOefaCache());
  }

  it('planner: a listing query plans a single data task with the listing title', async () => {
    const plan = await createOfflinePlanner(NOW).plan({
      request: req('Lístame las entidades sancionadas este año', 'es'),
      state: {} as OrchestratorState,
    });
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]!.domain).toBe('oefa_data');
    expect(plan.tasks[0]!.title).toBe('Listar administrados sancionados');
    expect(plan.reasoning).toContain('listado');
  });

  it('data agent: a listing query returns the entities as clarification candidates', async () => {
    const task = { ...dataTask, inputs: { query: 'Lístame las entidades sancionadas' } };
    const result = await createOfflineDataAgent(service(), undefined, NOW).run(task, ctx('es'));
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification!.candidates[0]!.label).toBe('Minera Las Bambas S.A.');
    expect(result.clarification!.candidates[0]!.ruc).toBe('20543210981');
  });

  it('data agent: clicking a candidate (resume) runs the normal entity cycle, not the listing', async () => {
    const task = {
      ...dataTask,
      inputs: { query: 'Lístame las entidades sancionadas', clarificationAnswer: '20543210981' },
    };
    const result = await createOfflineDataAgent(service(), undefined, NOW).run(task, ctx('es'));
    expect(result.status).toBe('completed');
    expect(result.findings[0]!.statement).toContain('Minera Las Bambas');
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
  });
});
