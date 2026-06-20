import { describe, expect, it } from 'vitest';
import type { Agent } from '@mastra/core/agent';
import { OefaRecord, type DomainTaskPacket, type OrchestratorState } from '@agentops/shared';
import { toLiveDataAgent, type AgentOutput } from './specialists.js';
import { InMemoryOefaCache } from '../../services/oefa/oefa-cache.js';
import { OefaService, SeedRecordSource } from '../../services/oefa/oefa-service.js';
import type { AgentRunContext } from '../coordinator/types.js';

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
  rec({ id: 'a1', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '10/02/2023', fineAmountUit: 300, resolutionStatus: 'firme' }),
  rec({ id: 'a2', administrado: 'Minera Las Bambas S.A.', ruc: '20543210981', sector: 'Minería', actoAdministrativoDate: '05/06/2021', fineAmountUit: 100, resolutionStatus: 'apelada' }),
  rec({ id: 'b1', administrado: 'Minera Bambas Servicios S.A.C.', ruc: '20601234567', sector: 'Minería', actoAdministrativoDate: '15/09/2022', fineAmountUit: 50, resolutionStatus: 'firme' }),
];

/** A Mastra Agent stub that returns a fixed structured output (no live model). */
function fakeAgent(out: AgentOutput): Agent {
  return { generate: async () => ({ object: out }) } as unknown as Agent;
}

function oefaService(): OefaService {
  return new OefaService(new SeedRecordSource(SEED), new InMemoryOefaCache());
}

function ctx(originalText: string): AgentRunContext {
  return {
    state: { workspace: { sharedFacts: { originalRequest: { text: originalText } } } } as unknown as OrchestratorState,
    artifacts: {},
    onProgress: () => {},
  };
}

const NARRATIVE: AgentOutput = {
  status: 'completed',
  summary: 'La empresa registra sanciones firmes.',
  findings: [],
  evidence: [{ id: 'OEFA:a1', documentTitle: 'Res. 1', passage: 'p', confidence: 'directa' }],
};

/** A completed answer that cites no OEFA record → falls back to the query heuristic. */
const NO_CITATION: AgentOutput = {
  status: 'completed',
  summary: 'Respuesta sin cita de registro OEFA.',
  findings: [],
  evidence: [],
};

function task(inputs: DomainTaskPacket['inputs']): DomainTaskPacket {
  return {
    taskId: 'data',
    domain: 'oefa_data',
    operation: 'search',
    title: 'Buscar registros',
    instruction: 'Resolver la entidad',
    inputs,
    dependsOn: [],
  };
}

describe('toLiveDataAgent — narrative + deterministic artifacts', () => {
  it('appends record_set + chart_data artifacts when the entity resolves, keeping the LLM narrative', async () => {
    const agent = toLiveDataAgent(fakeAgent(NARRATIVE), oefaService());
    const result = await agent.run(task({ query: 'RUC 20543210981' }), ctx('antecedentes RUC 20543210981'));

    expect(result.status).toBe('completed');
    expect(result.summary).toBe(NARRATIVE.summary); // LLM narrative preserved
    expect(result.evidence).toHaveLength(1);
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
    expect(result.artifacts.some((a) => a.kind === 'chart_data')).toBe(true);
    const recordSet = result.artifacts.find((a) => a.kind === 'record_set')!;
    expect(recordSet.id).toBe('records:20543210981');
  });

  it('anchors the artifacts to the company the LLM cited, even if the query is ambiguous', async () => {
    // Query "bambas" alone is ambiguous (Las Bambas vs Bambas Servicios), but the
    // LLM cited record b1 → artifacts must describe Servicios (RUC 20601234567),
    // matching the narrative, not the ambiguous query heuristic.
    const cited: AgentOutput = {
      status: 'completed',
      summary: 'Bambas Servicios registra una sanción firme.',
      findings: [],
      evidence: [{ id: 'OEFA:b1', documentTitle: 'Res. b1', passage: 'p', confidence: 'directa' }],
    };
    const agent = toLiveDataAgent(fakeAgent(cited), oefaService());
    const result = await agent.run(task({ query: 'bambas' }), ctx('sanciones de bambas'));
    const recordSet = result.artifacts.find((a) => a.kind === 'record_set')!;
    expect(recordSet.id).toBe('records:20601234567');
  });

  it('resolves the entity from the original request when the task carries no query or citation', async () => {
    const agent = toLiveDataAgent(fakeAgent(NO_CITATION), oefaService());
    const result = await agent.run(task({}), ctx('antecedentes RUC 20543210981'));
    const recordSet = result.artifacts.find((a) => a.kind === 'record_set')!;
    expect(recordSet.id).toBe('records:20543210981');
  });

  it('returns narrative only (no artifacts) when the entity is ambiguous and uncited', async () => {
    const agent = toLiveDataAgent(fakeAgent(NO_CITATION), oefaService());
    const result = await agent.run(task({ query: 'bambas' }), ctx('sanciones de bambas'));
    expect(result.status).toBe('completed');
    expect(result.artifacts).toHaveLength(0);
  });

  it('does not crash when a live planner emits a non-string query input', async () => {
    const agent = toLiveDataAgent(fakeAgent(NO_CITATION), oefaService());
    // inputs.query is z.unknown() — a number must not reach String.prototype.match.
    const result = await agent.run(task({ query: 42 }), ctx('antecedentes RUC 20543210981'));
    // Falls back to the original request text → resolves Las Bambas.
    const recordSet = result.artifacts.find((a) => a.kind === 'record_set')!;
    expect(recordSet.id).toBe('records:20543210981');
  });

  it('does not attach artifacts for a clarification result', async () => {
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Se requiere desambiguar.',
      findings: [],
      evidence: [],
      clarification: { question: '¿Cuál?', candidates: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(clarifying), oefaService());
    const result = await agent.run(task({ query: 'RUC 20543210981' }), ctx('bambas'));
    expect(result.status).toBe('needs_user_input');
    expect(result.artifacts).toHaveLength(0);
    expect(result.clarification?.question).toBe('¿Cuál?');
  });
});
