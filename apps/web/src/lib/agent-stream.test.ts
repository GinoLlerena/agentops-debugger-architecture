import { describe, expect, it } from 'vitest';
import type { SessionSnapshot, StreamEvent } from '@agentops/shared';
import {
  hydrateChatState,
  initialChatState,
  parseSSEBuffer,
  reduceEvent,
  type ChatState,
} from './agent-stream.js';

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
          artifacts: [],
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

  it('on an approval with a report preview, tracks the report and opens the Informe tab', () => {
    const state = fold([
      {
        type: 'approval_required',
        payload: { interruptId: 'i1', description: 'Guardar informe', reportPreviewId: 'report-9' },
      },
    ]);
    expect(state.reportId).toBe('report-9');
    expect(state.requestedTab).toBe('informe');
  });

  it('settles status to failed on an error event (UI never stuck on running)', () => {
    const state = fold([
      {
        type: 'plan',
        payload: { reasoning: 'r', tasks: [] },
      },
      { type: 'error', payload: { code: '500', message: 'boom' } },
    ]);
    expect(state.status).toBe('failed');
    expect(state.messages.some((m) => m.kind === 'error')).toBe(true);
  });

  it('accumulates evidence across multiple results, de-duped by id', () => {
    const state = fold([
      {
        type: 'result',
        payload: {
          text: 't1',
          uiActions: [],
          evidence: [
            { id: 'A', documentTitle: 'd', passage: 'p', confidence: 'directa' },
            { id: 'B', documentTitle: 'd', passage: 'p', confidence: 'directa' },
          ],
          artifacts: [],
        },
      },
      {
        type: 'result',
        payload: {
          text: 't2',
          uiActions: [],
          evidence: [
            { id: 'B', documentTitle: 'd', passage: 'p', confidence: 'directa' }, // dup
            { id: 'C', documentTitle: 'd', passage: 'p', confidence: 'directa' },
          ],
          artifacts: [],
        },
      },
    ]);
    expect(state.evidence.map((e) => e.id)).toEqual(['A', 'B', 'C']);
  });

  it('collects chart_data artifacts and applies an open_tab uiAction', () => {
    const chart = {
      id: 'oefa-sanciones-por-anio',
      kind: 'bar' as const,
      title: '¿Cuántas por año?',
      series: [{ label: '2023', value: 3 }],
      source: 'API OEFA',
      asOf: '2026-06-13T12:00:00.000Z',
    };
    const state = fold([
      {
        type: 'result',
        payload: {
          text: 'ok',
          uiActions: [
            { action: 'render_chart', chartId: chart.id, artifactId: chart.id },
            { action: 'open_tab', tab: 'datos' },
          ],
          evidence: [],
          artifacts: [
            {
              id: chart.id,
              kind: 'chart_data',
              producedByAgentId: 'data-agent',
              createdAt: '2026-06-13T12:00:00.000Z',
              data: chart,
            },
          ],
        },
      },
    ]);
    expect(state.charts.map((c) => c.id)).toEqual(['oefa-sanciones-por-anio']);
    expect(state.requestedTab).toBe('datos');
  });

  it('resets charts/evidence/requestedTab at a new turn (plan)', () => {
    const seeded: ChatState = {
      ...initialChatState,
      evidence: [{ id: 'E', documentTitle: 'd', passage: 'p', confidence: 'directa' }],
      charts: [
        { id: 'c', kind: 'bar', title: 't', series: [], source: 's', asOf: 'a' },
      ],
      requestedTab: 'datos',
    };
    const next = reduceEvent(seeded, { type: 'plan', payload: { reasoning: 'r', tasks: [] } });
    expect(next.evidence).toEqual([]);
    expect(next.charts).toEqual([]);
    expect(next.requestedTab).toBeUndefined();
  });

  it('skips a malformed chart_data artifact instead of storing it', () => {
    const state = fold([
      {
        type: 'result',
        payload: {
          text: 'ok',
          uiActions: [],
          evidence: [],
          artifacts: [
            {
              id: 'bad',
              kind: 'chart_data',
              producedByAgentId: 'data-agent',
              createdAt: '2026-06-13T12:00:00.000Z',
              data: { nope: true }, // not a valid ChartSpec
            },
          ],
        },
      },
    ]);
    expect(state.charts).toEqual([]);
  });
});

describe('hydrateChatState (rehydrate a reopened session)', () => {
  const base = { sessionId: 's1', evidence: [], charts: [] };

  it('restores a completed turn: user question + final answer', () => {
    const st = hydrateChatState({
      ...base,
      status: 'completed',
      userMessage: 'antecedentes RUC 20543210981',
      evidence: [{ id: 'OEFA:r1', documentTitle: 'Res. 1', passage: 'p', confidence: 'directa' }],
      finalText: 'La empresa registra 3 sanciones.',
    } as SessionSnapshot);

    expect(st.status).toBe('completed');
    expect(st.messages.map((m) => m.kind)).toEqual(['user', 'result']);
    expect(st.evidence).toHaveLength(1);
  });

  it('restores a waiting approval: approval card + Informe tab + reportId', () => {
    const st = hydrateChatState({
      ...base,
      status: 'waiting',
      userMessage: 'Genera un informe',
      reportId: 'report-7',
      pending: { type: 'approval', interruptId: 'i1', description: 'Guardar informe', reportPreviewId: 'report-7' },
    } as SessionSnapshot);

    expect(st.status).toBe('waiting');
    expect(st.messages.at(-1)!.kind).toBe('approval');
    expect(st.reportId).toBe('report-7');
    expect(st.requestedTab).toBe('informe');
  });

  it('restores a waiting clarification card', () => {
    const st = hydrateChatState({
      ...base,
      status: 'waiting',
      userMessage: 'sanciones de bambas',
      pending: {
        type: 'clarification',
        request: { question: '¿Cuál administrado?', candidates: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      },
    } as SessionSnapshot);

    const last = st.messages.at(-1)!;
    expect(last.kind).toBe('clarification');
    expect(st.status).toBe('waiting');
  });
});
