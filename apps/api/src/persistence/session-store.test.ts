import { describe, expect, it } from 'vitest';
import type { ArtifactRecord, OrchestratorState } from '@agentops/shared';
import { InMemoryDocumentStore } from '../services/storage/in-memory-store.js';
import { COLLECTIONS } from '../services/storage/index.js';
import { buildReport } from '../services/report/build-report.js';
import type { CompanyStats } from '../services/oefa/oefa-service.js';
import { SessionStore } from './session-store.js';

const stats: CompanyStats = {
  totalRecords: 3,
  withSanction: 3,
  sumFineUit: 450,
  sumFineSoles: 0,
  firmCount: 2,
  openCount: 1,
  reincidencia: true,
  sectors: ['Minería'],
  byYear: { '2023': 2 },
};

/** Minimal orchestrator state — SessionStore persists it as-is and derives the
 *  Session from the fields it reads (artifacts, completedTasks, finalResponseDraft). */
function stateWith(over: Partial<OrchestratorState>): OrchestratorState {
  return {
    sessionId: 's1',
    runId: 'r1',
    threadId: 's1',
    executionStatus: 'completed',
    language: 'es',
    workspace: { domains: {}, sharedFacts: { originalRequest: { text: 'antecedentes' } }, entityRefs: {} },
    conversation: { rollingSummary: '', turnSummaries: [], entityIndex: {}, decisionLog: [] },
    pendingTasks: [],
    completedTasks: [],
    artifacts: {},
    ledger: [],
    ...over,
  } as OrchestratorState;
}

const recordSet: ArtifactRecord = {
  id: 'records:20543210981',
  kind: 'record_set',
  producedByAgentId: 'data',
  createdAt: '2026-01-01T00:00:00.000Z',
  data: { records: [{ administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' }], stats },
};

describe('SessionStore — derives listing metadata from state (Finding 9)', () => {
  it('derives subjectEntity from the record set and a last-result line (Flow B)', async () => {
    const store = new SessionStore(new InMemoryDocumentStore());
    await store.saveState(
      stateWith({
        artifacts: { [recordSet.id]: recordSet },
        finalResponseDraft: '3 sanciones firmes para Minera Las Bambas S.A.',
        completedTasks: [
          {
            taskId: 'data',
            agentId: 'data',
            status: 'completed',
            summary: 's',
            artifacts: [],
            findings: [],
            evidence: [
              { id: 'OEFA:r1', documentTitle: 'D', passage: 'p', confidence: 'directa' },
              { id: 'OEFA:r2', documentTitle: 'D', passage: 'p', confidence: 'directa' },
            ],
            nextTasks: [],
            errors: [],
            warnings: [],
          },
        ],
      }),
    );
    const session = await store.getSession('s1');
    expect(session?.subjectEntity).toEqual({ name: 'Minera Las Bambas S.A.', ruc: '20543210981' });
    expect(session?.reportIds).toEqual([]);
    expect(session?.lastResultSummary?.keyFinding).toContain('3 sanciones firmes');
    expect(session?.lastResultSummary?.evidenceCount).toBe(2);
  });

  it('records the drafted report id and subject from a report draft (Flow A)', async () => {
    const report = buildReport({
      id: 'report-1',
      sessionId: 's1',
      entity: { administrado: 'Minera Las Bambas S.A.', ruc: '20543210981' },
      records: [],
      stats,
      evidence: [],
      question: 'antecedentes',
      source: 'API OEFA · RESOL-CON-MULTA-FIRME',
      coverage: '2019-2025',
      asOf: '2026-06-13T12:00:00.000Z',
      agentVersion: '0.1.0',
    });
    const draft: ArtifactRecord = {
      id: report.id,
      kind: 'report_draft',
      producedByAgentId: 'report',
      createdAt: report.createdAt,
      data: report,
    };
    const store = new SessionStore(new InMemoryDocumentStore());
    await store.saveState(
      stateWith({ artifacts: { [draft.id]: draft }, finalResponseDraft: 'Informe generado.' }),
    );
    const session = await store.getSession('s1');
    expect(session?.reportIds).toEqual(['report-1']);
    expect(session?.subjectEntity?.name).toBe('Minera Las Bambas S.A.');
  });

  it('preserves prior subject across a turn that produces nothing; counts turns', async () => {
    const store = new SessionStore(new InMemoryDocumentStore());
    await store.saveState(stateWith({ artifacts: { [recordSet.id]: recordSet } }));
    // A later clarification-only turn: no artifacts, no final text.
    await store.saveState(stateWith({ artifacts: {}, finalResponseDraft: undefined }));
    const session = await store.getSession('s1');
    expect(session?.subjectEntity).toEqual({ name: 'Minera Las Bambas S.A.', ruc: '20543210981' });
    expect(session?.messageCount).toBe(2);
  });
});

describe('SessionStore — loadState validates persisted state (item 12)', () => {
  it('round-trips a valid state', async () => {
    const store = new SessionStore(new InMemoryDocumentStore());
    await store.saveState(stateWith({ finalResponseDraft: 'ok' }));
    const loaded = await store.loadState('s1');
    expect(loaded?.sessionId).toBe('s1');
    expect(loaded?.finalResponseDraft).toBe('ok');
  });

  it('returns undefined for a malformed stored state instead of throwing', async () => {
    const docs = new InMemoryDocumentStore();
    // A stale/hand-edited row that is not a valid OrchestratorState.
    await docs.put(COLLECTIONS.snapshots, 'bad', { sessionId: 123, not: 'a state' });
    const store = new SessionStore(docs);
    await expect(store.loadState('bad')).resolves.toBeUndefined();
  });
});
