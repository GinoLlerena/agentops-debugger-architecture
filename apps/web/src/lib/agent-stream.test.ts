import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@agentops/shared';
import { initialChatState, parseSSEBuffer, reduceEvent, type ChatState } from './agent-stream.js';

const sse = (event: StreamEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

function fold(events: StreamEvent[]): ChatState {
  return events.reduce(reduceEvent, initialChatState);
}

describe('parseSSEBuffer', () => {
  it('parses complete frames and keeps a trailing partial as rest', () => {
    const e1: StreamEvent = { type: 'task_start', payload: { taskId: 't1', agentId: 'a', title: 'T' } };
    const buf = sse(e1) + 'event: done\ndata: {"type":"do'; // second frame incomplete
    const { events, rest } = parseSSEBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('task_start');
    expect(rest).toContain('"type":"do');
  });

  it('skips malformed JSON frames without throwing', () => {
    const { events } = parseSSEBuffer('data: {not json}\n\n');
    expect(events).toEqual([]);
  });

  it('skips frames that fail schema validation', () => {
    const { events } = parseSSEBuffer('data: {"type":"bogus","payload":{}}\n\n');
    expect(events).toEqual([]);
  });
});

describe('reduceEvent — plan morphs into a live checklist', () => {
  const events: StreamEvent[] = [
    {
      type: 'plan',
      payload: {
        reasoning: 'r',
        tasks: [
          { taskId: 'data', domain: 'oefa_data', operation: 'search', title: 'Datos', instruction: 'i', inputs: {}, dependsOn: [] },
          { taskId: 'docs', domain: 'oefa_docs', operation: 'search', title: 'Docs', instruction: 'i', inputs: {}, dependsOn: [] },
        ],
      },
    },
    { type: 'task_start', payload: { taskId: 'data', agentId: 'data-agent', title: 'Datos' } },
    { type: 'task_progress', payload: { taskId: 'data', caption: 'Consultando…', progress: 0.5 } },
    { type: 'task_done', payload: { taskId: 'data', status: 'completed', result: '8 registros' } },
  ];

  it('keeps a single plan message and updates its task rows in place', () => {
    const state = fold(events);
    const plans = state.messages.filter((m) => m.kind === 'plan');
    expect(plans).toHaveLength(1);
    const plan = plans[0] as Extract<ChatState['messages'][number], { kind: 'plan' }>;
    const dataRow = plan.tasks.find((t) => t.taskId === 'data')!;
    expect(dataRow.status).toBe('done');
    expect(dataRow.agentId).toBe('data-agent');
    expect(dataRow.caption).toBe('Consultando…');
    expect(dataRow.result).toBe('8 registros');
    expect(plan.tasks.find((t) => t.taskId === 'docs')!.status).toBe('pending');
    expect(state.status).toBe('running');
  });
});

describe('reduceEvent — terminal + branches', () => {
  it('captures result evidence and a typed done status', () => {
    const state = fold([
      {
        type: 'result',
        payload: {
          text: 'Listo',
          uiActions: [],
          evidence: [{ id: 'E1', documentTitle: 'Doc', passage: 'p', confidence: 'directa' }],
        },
      },
      { type: 'done', payload: { sessionId: 's1', status: 'completed' } },
    ]);
    expect(state.evidence).toHaveLength(1);
    expect(state.sessionId).toBe('s1');
    expect(state.status).toBe('completed');
    expect(state.messages.some((m) => m.kind === 'result')).toBe(true);
  });

  it('marks waiting on clarification and surfaces candidates', () => {
    const state = fold([
      {
        type: 'clarification_required',
        payload: { question: '¿Cuál?', candidates: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }] },
      },
      { type: 'done', payload: { sessionId: 's1', status: 'waiting' } },
    ]);
    expect(state.status).toBe('waiting');
    const clar = state.messages.find((m) => m.kind === 'clarification');
    expect(clar && clar.kind === 'clarification' && clar.candidates).toHaveLength(2);
  });

  it('marks waiting on an approval gate', () => {
    const state = fold([
      { type: 'approval_required', payload: { interruptId: 'i1', description: 'Guardar informe' } },
    ]);
    expect(state.status).toBe('waiting');
    expect(state.messages.some((m) => m.kind === 'approval')).toBe(true);
  });
});
