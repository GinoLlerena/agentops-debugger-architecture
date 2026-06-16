import { describe, expect, it, vi } from 'vitest';
import type {
  ClarificationRequest,
  DomainTaskPacket,
  DomainTaskResult,
  EvidenceItem,
  StreamEvent,
} from '@agentops/shared';
import { AGENT_IDS } from '../manifests/registry.js';
import { createCoordinator } from './coordinator.js';
import type { AgentMap, Planner, PlanResult, SpecialistAgent } from './types.js';

// ── test helpers ──────────────────────────────────────────────────────────────

function task(p: Partial<DomainTaskPacket> & Pick<DomainTaskPacket, 'taskId' | 'domain' | 'operation'>): DomainTaskPacket {
  return {
    title: p.taskId,
    instruction: 'do it',
    inputs: {},
    dependsOn: [],
    ...p,
  };
}

function result(
  taskId: string,
  agentId: string,
  over: Partial<DomainTaskResult> = {},
): DomainTaskResult {
  return {
    taskId,
    agentId,
    status: 'completed',
    summary: `${taskId} ok`,
    artifacts: [],
    findings: [],
    evidence: [],
    nextTasks: [],
    errors: [],
    warnings: [],
    ...over,
  };
}

const evidence = (id: string): EvidenceItem => ({
  id,
  documentTitle: 'Doc',
  passage: 'passage',
  confidence: 'directa',
});

function staticPlanner(plan: PlanResult): Planner {
  return { plan: async () => plan };
}

function fnAgent(agentId: string, run: SpecialistAgent['run']): SpecialistAgent {
  return { agentId, run };
}

/** Agent that returns a preset completed result. */
function okAgent(agentId: string, over: Partial<DomainTaskResult> = {}): SpecialistAgent {
  return fnAgent(agentId, async (t) => result(t.taskId, agentId, over));
}

function agentMap(...agents: SpecialistAgent[]): AgentMap {
  return Object.fromEntries(agents.map((a) => [a.agentId, a]));
}

const deterministic = { idgen: (() => { let n = 0; return () => `id-${++n}`; })(), clock: () => new Date('2026-06-15T00:00:00Z') };

// ── tests ──────────────────────────────────────────────────────────────────────

describe('Coordinator — happy path', () => {
  it('drains a 3-task plan to completion', async () => {
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'historial sancionador',
      tasks: [
        task({ taskId: 't1', domain: 'oefa_data', operation: 'search' }),
        task({ taskId: 't2', domain: 'oefa_docs', operation: 'search' }),
        task({ taskId: 't3', domain: 'report', operation: 'create' }),
      ],
    });
    const agents = agentMap(
      okAgent(AGENT_IDS.data, { evidence: [evidence('E1')] }),
      okAgent(AGENT_IDS.docs, { evidence: [evidence('E2')] }),
      okAgent(AGENT_IDS.report, {
        findings: [{ id: 'F1', statement: 'reincidencia', evidenceIds: ['E1'], confidence: 'directa' }],
      }),
    );
    const coord = createCoordinator({ planner, agents, ...deterministic });
    const state = await coord.start({ text: 'informe', sessionId: 's1', requestContext: {} });

    expect(state.executionStatus).toBe('completed');
    expect(state.completedTasks).toHaveLength(3);
    expect(state.pendingTasks).toHaveLength(0);
    expect(state.completedTasks[2]!.findings).toHaveLength(1); // finding kept (cited E1)
  });

  it('stamps every evidence item with its producing agent', async () => {
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'r',
      tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })],
    });
    const agents = agentMap(
      okAgent(AGENT_IDS.data, { evidence: [evidence('E1')] }), // evidence has no producedByAgentId
    );
    const coord = createCoordinator({ planner, agents, ...deterministic });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    const stamped = state.completedTasks[0]!.evidence[0]!;
    expect(stamped.producedByAgentId).toBe(AGENT_IDS.data);
  });

  it('emits a coherent progress event sequence', async () => {
    const events: StreamEvent[] = [];
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'r',
      tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })],
    });
    const coord = createCoordinator({ planner, agents: agentMap(okAgent(AGENT_IDS.data)), ...deterministic });
    await coord.start({ text: 'q', sessionId: 's1', requestContext: {} }, { onProgress: (e) => void events.push(e) });
    expect(events.map((e) => e.type)).toEqual(['plan', 'task_start', 'task_done', 'result']);
  });

  it('answers directly when the planner returns a reply (no tasks)', async () => {
    const coord = createCoordinator({
      planner: staticPlanner({ kind: 'reply', text: 'No encontré evidencia en las fuentes.' }),
      agents: {},
      ...deterministic,
    });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(state.executionStatus).toBe('completed');
    expect(state.finalResponseDraft).toContain('No encontré evidencia');
    expect(state.completedTasks).toHaveLength(0);
  });
});

describe('Coordinator — evidence guardrail (FR-41)', () => {
  it('drops an uncited finding and logs guardrail_drop', async () => {
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'r',
      tasks: [
        task({ taskId: 't1', domain: 'oefa_data', operation: 'search' }),
        task({ taskId: 't2', domain: 'report', operation: 'create' }),
      ],
    });
    const agents = agentMap(
      okAgent(AGENT_IDS.data, { evidence: [evidence('E1')] }),
      okAgent(AGENT_IDS.report, {
        findings: [
          { id: 'F1', statement: 'respaldada', evidenceIds: ['E1'], confidence: 'directa' },
          { id: 'F2', statement: 'inventada', evidenceIds: [], confidence: 'directa' },
          { id: 'F3', statement: 'cita fantasma', evidenceIds: ['E999'], confidence: 'directa' },
        ],
      }),
    );
    const coord = createCoordinator({ planner, agents, ...deterministic });
    const state = await coord.start({ text: 'informe', sessionId: 's1', requestContext: {} });

    const report = state.completedTasks.find((t) => t.taskId === 't2')!;
    expect(report.findings.map((f) => f.id)).toEqual(['F1']); // F2/F3 dropped
    const drop = state.ledger.find((e) => e.type === 'guardrail_drop');
    expect(drop?.payload.count).toBe(2);
  });
});

describe('Coordinator — HITL approval gate (FR-44)', () => {
  function setup() {
    const save = vi.fn(async (t: DomainTaskPacket) => result(t.taskId, AGENT_IDS.reportManager));
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'guardar',
      tasks: [task({ taskId: 'save1', domain: 'report_admin', operation: 'create', title: 'Guardar informe' })],
    });
    const coord = createCoordinator({
      planner,
      agents: agentMap(fnAgent(AGENT_IDS.reportManager, save)),
      ...deterministic,
    });
    return { coord, save };
  }

  it('suspends before a save and does not run the agent', async () => {
    const { coord, save } = setup();
    const state = await coord.start({ text: 'guardar', sessionId: 's1', requestContext: {} });
    expect(state.executionStatus).toBe('waiting');
    expect(state.interruptState?.reason).toBe('approval');
    expect(save).not.toHaveBeenCalled();
    expect(state.ledger.some((e) => e.type === 'approval_required')).toBe(true);
  });

  it('runs the save after approval is granted', async () => {
    const { coord, save } = setup();
    const suspended = await coord.start({ text: 'guardar', sessionId: 's1', requestContext: {} });
    const done = await coord.resume(suspended, { type: 'approval', approved: true });
    expect(done.executionStatus).toBe('completed');
    expect(save).toHaveBeenCalledTimes(1);
    expect(done.ledger.some((e) => e.type === 'approval_granted')).toBe(true);
  });

  it('cancels without running the save when approval is denied', async () => {
    const { coord, save } = setup();
    const suspended = await coord.start({ text: 'guardar', sessionId: 's1', requestContext: {} });
    const done = await coord.resume(suspended, { type: 'approval', approved: false });
    expect(done.executionStatus).toBe('completed');
    expect(save).not.toHaveBeenCalled();
    expect(done.finalResponseDraft).toContain('cancel');
  });
});

describe('Coordinator — clarification suspend/resume', () => {
  it('suspends on a planner clarification and re-plans on resume', async () => {
    let planCalls = 0;
    const clarification: ClarificationRequest = {
      question: '¿Cuál administrado?',
      candidates: [{ id: 'c1', label: 'La Pampilla', ruc: '20100110663' }],
    };
    const planner: Planner = {
      plan: async () => {
        planCalls++;
        return planCalls === 1
          ? { kind: 'clarification', clarification }
          : { kind: 'plan', reasoning: 'ok', tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })] };
      },
    };
    const coord = createCoordinator({ planner, agents: agentMap(okAgent(AGENT_IDS.data)), ...deterministic });
    const suspended = await coord.start({ text: 'sanciones de la pampilla', sessionId: 's1', requestContext: {} });
    expect(suspended.executionStatus).toBe('waiting');
    expect(suspended.interruptState?.taskId).toBeUndefined(); // planner-origin

    const done = await coord.resume(suspended, { type: 'clarification', answer: '20100110663' });
    expect(done.executionStatus).toBe('completed');
    expect(done.completedTasks).toHaveLength(1);
  });

  it('suspends on an agent needs_user_input and re-runs the task on resume', async () => {
    let runs = 0;
    const dataAgent = fnAgent(AGENT_IDS.data, async (t) => {
      runs++;
      if (runs === 1) {
        return result(t.taskId, AGENT_IDS.data, {
          status: 'needs_user_input',
          clarification: {
            question: '¿Cuál RUC?',
            candidates: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }],
          },
        });
      }
      expect(t.inputs.clarificationAnswer).toBe('20100110663'); // answer injected
      return result(t.taskId, AGENT_IDS.data);
    });
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'r',
      tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })],
    });
    const coord = createCoordinator({ planner, agents: agentMap(dataAgent), ...deterministic });
    const suspended = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(suspended.executionStatus).toBe('waiting');
    expect(suspended.interruptState?.taskId).toBe('t1'); // agent-origin

    const done = await coord.resume(suspended, { type: 'clarification', answer: '20100110663' });
    expect(done.executionStatus).toBe('completed');
    expect(runs).toBe(2);
  });
});

describe('Coordinator — robustness', () => {
  it('halts a runaway loop at MAX_TASK_STEPS with a partial result', async () => {
    // agent endlessly enqueues another task
    const loopAgent = fnAgent(AGENT_IDS.data, async (t) =>
      result(t.taskId, AGENT_IDS.data, {
        nextTasks: [task({ taskId: `${t.taskId}+`, domain: 'oefa_data', operation: 'search' })],
      }),
    );
    const coord = createCoordinator({
      planner: staticPlanner({
        kind: 'plan',
        reasoning: 'r',
        tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })],
      }),
      agents: agentMap(loopAgent),
      maxTaskSteps: 3,
      ...deterministic,
    });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(state.completedTasks).toHaveLength(3);
    expect(state.ledger.some((e) => e.type === 'warning' && e.payload.code === 'max_task_steps')).toBe(true);
    expect(state.finalResponseDraft).toContain('parcial');
  });

  it('fails an unroutable task cleanly and continues with the rest', async () => {
    const planner = staticPlanner({
      kind: 'plan',
      reasoning: 'r',
      tasks: [
        task({ taskId: 'bad', domain: 'oefa_data', operation: 'delete' }), // no agent owns this pair
        task({ taskId: 'good', domain: 'oefa_data', operation: 'search' }),
      ],
    });
    const coord = createCoordinator({ planner, agents: agentMap(okAgent(AGENT_IDS.data)), ...deterministic });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(state.executionStatus).toBe('completed');
    expect(state.completedTasks.find((t) => t.taskId === 'bad')!.status).toBe('failed');
    expect(state.completedTasks.find((t) => t.taskId === 'good')!.status).toBe('completed');
  });

  it('surfaces an all-failed run instead of reporting "no evidence"', async () => {
    const boom = fnAgent(AGENT_IDS.data, async () => {
      throw new Error('caído');
    });
    const coord = createCoordinator({
      planner: staticPlanner({
        kind: 'plan',
        reasoning: 'r',
        tasks: [
          task({ taskId: 't1', domain: 'oefa_data', operation: 'search' }),
          task({ taskId: 't2', domain: 'oefa_data', operation: 'search' }),
        ],
      }),
      agents: agentMap(boom),
      ...deterministic,
    });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(state.finalResponseDraft).toMatch(/error/i);
    expect(state.finalResponseDraft).not.toMatch(/No encontré evidencia/);
  });

  it('propagates a clarification answer to ALL pending tasks, not just the head', async () => {
    let docsSawAnswer: unknown;
    const dataAgent = fnAgent(AGENT_IDS.data, async (t) =>
      t.inputs.clarificationAnswer
        ? result(t.taskId, AGENT_IDS.data)
        : result(t.taskId, AGENT_IDS.data, {
            status: 'needs_user_input',
            clarification: { question: '¿Cuál?', candidates: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }] },
          }),
    );
    const docsAgent = fnAgent(AGENT_IDS.docs, async (t) => {
      docsSawAnswer = t.inputs.clarificationAnswer;
      return result(t.taskId, AGENT_IDS.docs);
    });
    const coord = createCoordinator({
      planner: staticPlanner({
        kind: 'plan',
        reasoning: 'r',
        tasks: [
          task({ taskId: 'data', domain: 'oefa_data', operation: 'search' }),
          task({ taskId: 'docs', domain: 'oefa_docs', operation: 'search' }),
        ],
      }),
      agents: agentMap(dataAgent, docsAgent),
      ...deterministic,
    });
    const suspended = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(suspended.executionStatus).toBe('waiting');
    const done = await coord.resume(suspended, { type: 'clarification', answer: '20543210981' });
    expect(done.executionStatus).toBe('completed');
    expect(docsSawAnswer).toBe('20543210981'); // sibling task received the answer too
  });

  it('converts a thrown agent error into a failed result (errors are data)', async () => {
    const boom = fnAgent(AGENT_IDS.data, async () => {
      throw new Error('tool exploded');
    });
    const coord = createCoordinator({
      planner: staticPlanner({
        kind: 'plan',
        reasoning: 'r',
        tasks: [task({ taskId: 't1', domain: 'oefa_data', operation: 'search' })],
      }),
      agents: agentMap(boom),
      ...deterministic,
    });
    const state = await coord.start({ text: 'q', sessionId: 's1', requestContext: {} });
    expect(state.executionStatus).toBe('completed');
    const failed = state.completedTasks[0]!;
    expect(failed.status).toBe('failed');
    expect(failed.errors[0]!.message).toContain('tool exploded');
  });
});
