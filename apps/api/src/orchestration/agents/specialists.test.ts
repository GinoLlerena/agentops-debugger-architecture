import { describe, expect, it } from 'vitest';
import type { Agent } from '@mastra/core/agent';
import { OefaRecord, type DomainTaskPacket, type OrchestratorState } from '@agentops/shared';
import {
  AgentOutputSchema,
  resolveSummary,
  toLiveDataAgent,
  toLiveDocsAgent,
  type AgentOutput,
} from './specialists.js';
import { InMemoryOefaCache } from '../../services/oefa/oefa-cache.js';
import { OefaService, SeedRecordSource } from '../../services/oefa/oefa-service.js';
import { loadSeedCorpus, RagService } from '../../services/rag/index.js';
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

  it('overrides a model clarification when the query actually resolves uniquely', async () => {
    // Live variance: the model claims ambiguity for a query the records resolve
    // (observed on the deployed instance with the report-suggestion query).
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Se requiere desambiguar.',
      findings: [],
      evidence: [],
      clarification: { question: '¿Cuál?', candidates: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(clarifying), oefaService());
    const result = await agent.run(task({ query: 'RUC 20543210981' }), ctx('bambas'));
    expect(result.status).toBe('completed');
    expect(result.clarification).toBeUndefined();
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
  });

  it('replaces a model clarification with deterministic candidates when genuinely ambiguous', async () => {
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Ambiguous.',
      findings: [],
      evidence: [],
      // The model's own candidates may be junk (or missing) — never trust them.
      clarification: { question: 'Which?', candidates: [{ id: 'x', label: 'X' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(clarifying), oefaService());
    const result = await agent.run(task({ query: 'sanciones de bambas' }), ctx('sanciones de bambas'));
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification!.candidates.map((c) => c.label).sort()).toEqual([
      'Minera Bambas Servicios S.A.C.',
      'Minera Las Bambas S.A.',
    ]);
    expect(result.clarification!.candidates[0]!.ruc).toBeDefined();
  });

  it('passes a clarification through when the query resolves to nothing', async () => {
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Se requiere aclarar.',
      findings: [],
      evidence: [],
      clarification: { question: '¿Cuál?', candidates: [{ id: 'a', label: 'A' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(clarifying), oefaService());
    const result = await agent.run(task({ query: 'empresa desconocida xyz' }), ctx('empresa desconocida xyz'));
    expect(result.status).toBe('needs_user_input');
    expect(result.clarification?.question).toBe('¿Cuál?');
    expect(result.artifacts).toHaveLength(0);
  });

  it('never re-asks an answered clarification — resolves the clicked entity deterministically', async () => {
    // Observed live (qwen-plus, English): on resume the model loops and returns
    // needs_user_input again for the entity the user just picked. The clarified
    // path must complete from the records regardless of the model's mood.
    const looping: AgentOutput = {
      status: 'needs_user_input',
      summary: "The provided RUC requires resolution to identify the administrado.",
      findings: [],
      evidence: [],
      clarification: { question: 'Which entity?', candidates: [{ id: 'x', label: 'X' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(looping), oefaService());
    const result = await agent.run(
      task({ query: 'List the sanctioned entities', clarificationAnswer: '20543210981' }),
      ctx('List the sanctioned entities'),
    );
    expect(result.status).toBe('completed');
    expect(result.clarification).toBeUndefined();
    expect(result.summary).toContain('Minera Las Bambas');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]!.id).toMatch(/^OEFA:/);
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
    expect(result.artifacts.some((a) => a.kind === 'chart_data')).toBe(true);
  });

  it('passes a non-completed result through when the clarified entity does not resolve', async () => {
    const failing: AgentOutput = {
      status: 'failed',
      summary: 'x',
      findings: [],
      evidence: [],
    };
    const agent = toLiveDataAgent(fakeAgent(failing), oefaService());
    const result = await agent.run(
      task({ clarificationAnswer: '99999999999' }), // unknown RUC → not_found
      ctx('sanciones'),
    );
    expect(result.status).toBe('failed');
    expect(result.artifacts).toHaveLength(0);
  });

  it('rescues a failed narrative when the verbatim user text names a valid RUC', async () => {
    // Live round 8 (qwen-plus, English): an LLM hop corrupted the RUC's digits
    // in transit ('20543210981' → '205432110981') and the task failed as
    // "malformed RUC" without a tool call. The user's message is the authority.
    const failing: AgentOutput = {
      status: 'failed',
      summary:
        "The provided RUC '205432110981' appears to be malformed: it contains 12 digits.",
      findings: [],
      evidence: [],
    };
    const agent = toLiveDataAgent(fakeAgent(failing), oefaService());
    const result = await agent.run(
      task({ query: 'Background of the regulated entity with RUC 205432110981' }), // corrupted inputs
      ctx('Background of the regulated entity with RUC 20543210981'), // verbatim user text
    );
    expect(result.status).toBe('completed');
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toContain('Minera Las Bambas');
    expect(result.evidence[0]!.id).toMatch(/^OEFA:/);
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
  });

  it('still passes a failure through when the user text itself has a malformed RUC', async () => {
    // A 12-digit typo typed by the user matches no record — the honest failure
    // ("malformed RUC, no records retrieved") must stand.
    const failing: AgentOutput = {
      status: 'failed',
      summary: 'Malformed RUC.',
      findings: [],
      evidence: [],
    };
    const agent = toLiveDataAgent(fakeAgent(failing), oefaService());
    const result = await agent.run(
      task({ query: 'RUC 205432110981' }),
      ctx('Background of the regulated entity with RUC 205432110981'),
    );
    expect(result.status).toBe('failed');
    expect(result.artifacts).toHaveLength(0);
  });

  it('replaces a hollow completion (zero evidence) with the deterministic answer', async () => {
    // Observed live: the model called the right tools, then narrated the WRONG
    // entity ("MINISTERIO DE ENERGIA Y MINAS" for Las Bambas' RUC); the
    // guardrail dropped every uncited finding, leaving completed + no evidence
    // — but the wrong summary survived. An entity answer without evidence is
    // never legitimate in this domain.
    const hollow: AgentOutput = {
      status: 'completed',
      summary: "Entity resolved as 'MINISTERIO DE ENERGIA Y MINAS' with no ambiguity.",
      findings: [],
      evidence: [],
    };
    const agent = toLiveDataAgent(fakeAgent(hollow), oefaService());
    const result = await agent.run(
      task({ query: 'Background of the regulated entity with RUC 20543210981' }),
      ctx('Background of the regulated entity with RUC 20543210981'),
    );
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Minera Las Bambas');
    expect(result.summary).not.toContain('MINISTERIO');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
  });

  it('anchors a model clarification to the verbatim RUC even when the task inputs are corrupted', async () => {
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Which entity?',
      findings: [],
      evidence: [],
      clarification: { question: 'Which?', candidates: [{ id: 'x', label: 'X' }] },
    };
    const agent = toLiveDataAgent(fakeAgent(clarifying), oefaService());
    const result = await agent.run(
      task({ query: 'RUC 205432110981' }), // corrupted inputs
      ctx('Background of the regulated entity with RUC 20543210981'),
    );
    expect(result.status).toBe('completed');
    expect(result.clarification).toBeUndefined();
    expect(result.artifacts.some((a) => a.kind === 'record_set')).toBe(true);
  });

  it('answers a listing query deterministically — the LLM is never called', async () => {
    const explodingAgent = {
      generate: async () => {
        throw new Error('the listing path must not invoke the model');
      },
    } as unknown as Agent;
    const agent = toLiveDataAgent(
      explodingAgent,
      oefaService(),
      undefined,
      undefined,
      () => new Date('2026-07-02T12:00:00Z'),
    );
    const result = await agent.run(
      task({ query: 'Lístame las entidades sancionadas este año' }),
      ctx('Lístame las entidades sancionadas este año'),
    );
    expect(result.status).toBe('needs_user_input');
    // 2026 has no records → honest empty-range note + full entity fallback.
    expect(result.clarification!.question).toContain('2026');
    expect(result.clarification!.candidates.map((c) => c.label)).toContain('Minera Las Bambas S.A.');
  });

  it('routes a listing resume (clicked candidate) through the normal narrative flow', async () => {
    const agent = toLiveDataAgent(fakeAgent(NARRATIVE), oefaService(), undefined, undefined, () => new Date('2026-07-02T12:00:00Z'));
    const result = await agent.run(
      task({ query: 'Lístame las entidades sancionadas', clarificationAnswer: '20543210981' }),
      ctx('Lístame las entidades sancionadas'),
    );
    expect(result.status).toBe('completed');
    const recordSet = result.artifacts.find((a) => a.kind === 'record_set')!;
    expect(recordSet.id).toBe('records:20543210981');
  });
});

/**
 * Live-model output variance (observed with qwen-plus on the deployed instance):
 * the model returns status synonyms outside the enum and sometimes omits the
 * summary. The schema must absorb that variance instead of failing the task.
 */
describe('toLiveDocsAgent — narrative + deterministic retrieval fallback', () => {
  const docsTask = (): DomainTaskPacket => ({
    taskId: 'docs',
    domain: 'oefa_docs',
    operation: 'search',
    title: 'Buscar documentos',
    instruction: 'Recuperar normativa relevante',
    inputs: { query: 'medidas correctivas y multas de minera' },
    dependsOn: [],
  });

  async function ragService(): Promise<RagService> {
    const rag = new RagService();
    await rag.indexDocuments(await loadSeedCorpus());
    return rag;
  }

  it('keeps the narrator answer when it completes', async () => {
    const narrated: AgentOutput = {
      status: 'completed',
      summary: 'Se recuperaron 2 fragmentos normativos.',
      findings: [],
      evidence: [{ id: 'DOC:x', documentTitle: 'Guía', passage: 'p', confidence: 'directa' }],
    };
    const agent = toLiveDocsAgent(fakeAgent(narrated), await ragService());
    const result = await agent.run(docsTask(), ctx('antecedentes de minera'));
    expect(result.summary).toBe('Se recuperaron 2 fragmentos normativos.');
    expect(result.evidence[0]!.id).toBe('DOC:x');
  });

  it('answers with deterministic retrieval when the narrator throws (live: structured-output validation)', async () => {
    // Observed live: qwen-plus returned an array where the schema wants an
    // object → MastraError → failed task → empty Documents tab. Retrieval is
    // deterministic, so the fallback must answer instead.
    const exploding = {
      generate: async () => {
        throw new Error('Structured output validation failed: - root: Expected object, received array');
      },
    } as unknown as Agent;
    const agent = toLiveDocsAgent(exploding, await ragService());
    const result = await agent.run(docsTask(), ctx('antecedentes de minera'));
    expect(result.status).toBe('completed');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]!.producedByAgentId).toBe('docs-agent');
    expect(result.findings.length).toBe(1);
  });

  it('retrieves deterministically when the narrator completes hollow (declared "no documents" without evidence)', async () => {
    // Observed live: qwen-plus completed the docs task with "the query returned
    // no matching records" WITHOUT ever calling its retrieval tool (no
    // tool_called events, zero evidence). Only the deterministic retriever may
    // conclude "no documents".
    const hollow: AgentOutput = {
      status: 'completed',
      summary: 'No normative documents were retrieved. The query returned no matching records.',
      findings: [],
      evidence: [],
    };
    const agent = toLiveDocsAgent(fakeAgent(hollow), await ragService());
    const result = await agent.run(docsTask(), ctx('antecedentes de minera'));
    expect(result.status).toBe('completed');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]!.producedByAgentId).toBe('docs-agent');
  });

  it('falls back too when the narrator asks for clarification (docs never needs one)', async () => {
    const clarifying: AgentOutput = {
      status: 'needs_user_input',
      summary: 'Which document?',
      findings: [],
      evidence: [],
      clarification: { question: 'Which?', candidates: [{ id: 'x', label: 'X' }] },
    };
    const agent = toLiveDocsAgent(fakeAgent(clarifying), await ragService());
    const result = await agent.run(docsTask(), ctx('antecedentes de minera'));
    expect(result.status).toBe('completed');
    expect(result.clarification).toBeUndefined();
  });
});

describe('AgentOutputSchema — tolerant to live-model variance', () => {
  it.each([
    ['success', 'completed'],
    ['SUCCESS', 'completed'],
    ['done', 'completed'],
    ['completed', 'completed'],
    ['error', 'failed'],
    ['failure', 'failed'],
    ['failed', 'failed'],
    ['clarification', 'needs_user_input'],
    ['needs_user_input', 'needs_user_input'],
  ])('coerces status %j → %j', (raw, expected) => {
    const out = AgentOutputSchema.parse({ status: raw, summary: 's' });
    expect(out.status).toBe(expected);
  });

  it('defaults an unrecognized status to completed (single-shot answer is final)', () => {
    expect(AgentOutputSchema.parse({ status: 'in_progress', summary: 's' }).status).toBe('completed');
    expect(AgentOutputSchema.parse({ summary: 's' }).status).toBe('completed');
  });

  it('accepts a missing summary (resolved after parsing)', () => {
    const out = AgentOutputSchema.parse({ status: 'success' });
    expect(out.summary).toBeUndefined();
  });
});

describe('resolveSummary', () => {
  const finding = {
    id: 'f1',
    statement: 'Hallazgo citado.',
    evidenceIds: [],
    confidence: 'directa' as const,
  };

  it('prefers the model summary', () => {
    const out = AgentOutputSchema.parse({ summary: 'Resumen del modelo.', findings: [finding] });
    expect(resolveSummary(out, 'es')).toBe('Resumen del modelo.');
  });

  it('falls back to the first finding statement', () => {
    const out = AgentOutputSchema.parse({ findings: [finding] });
    expect(resolveSummary(out, 'es')).toBe('Hallazgo citado.');
  });

  it('falls back to a neutral localized line when there is nothing else', () => {
    const out = AgentOutputSchema.parse({});
    expect(resolveSummary(out, 'es')).toBe('Tarea completada (sin resumen).');
    expect(resolveSummary(out, 'en')).toBe('Task completed (no summary provided).');
  });

  it('treats a whitespace-only summary as missing', () => {
    const out = AgentOutputSchema.parse({ summary: '   ', findings: [finding] });
    expect(resolveSummary(out, 'es')).toBe('Hallazgo citado.');
  });
});

describe('AgentOutputSchema — tolerant evidence (live variance)', () => {
  const good = {
    id: 'OEFA:a1',
    documentTitle: 'RUIAS — Resoluciones firmes',
    passage: 'Multa de 300 UIT (2023).',
    confidence: 'directa',
  };

  it('keeps valid items and drops malformed ones instead of failing the task', () => {
    const out = AgentOutputSchema.parse({
      summary: 's',
      evidence: [good, { id: 'E2' /* missing documentTitle/passage/confidence */ }],
    });
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]!.id).toBe('OEFA:a1');
  });

  it('maps common field aliases (title/text) onto the contract', () => {
    const out = AgentOutputSchema.parse({
      summary: 's',
      evidence: [{ id: 'E1', title: 'Informe de supervisión', text: 'Pasaje citado.', confidence: 'direct' }],
    });
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]!.documentTitle).toBe('Informe de supervisión');
    expect(out.evidence[0]!.passage).toBe('Pasaje citado.');
    expect(out.evidence[0]!.confidence).toBe('directa');
  });

  it('coerces English confidence labels in findings', () => {
    const out = AgentOutputSchema.parse({
      summary: 's',
      findings: [{ id: 'f1', statement: 'x', confidence: 'inference' }],
    });
    expect(out.findings[0]!.confidence).toBe('inferencia');
  });

  it('an empty/absent evidence array still parses', () => {
    expect(AgentOutputSchema.parse({ summary: 's' }).evidence).toEqual([]);
  });
});

describe('AgentOutputSchema — tolerant findings (live variance)', () => {
  it('drops findings that still lack a statement, keeps the rest', () => {
    const out = AgentOutputSchema.parse({
      summary: 's',
      findings: [
        { id: 'f1', statement: 'Multa firme de 300 UIT.', confidence: 'directa' },
        { id: 'f2', confidence: 'directa' }, // no statement under any alias
      ],
    });
    expect(out.findings).toHaveLength(1);
  });

  it('maps statement aliases and fills id/confidence', () => {
    const out = AgentOutputSchema.parse({
      summary: 's',
      findings: [{ text: 'Hallazgo con otro nombre de campo.' }],
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.statement).toBe('Hallazgo con otro nombre de campo.');
    expect(out.findings[0]!.id).toBe('f1');
    expect(out.findings[0]!.confidence).toBe('sin_evidencia'); // weakest label when absent
  });
});
