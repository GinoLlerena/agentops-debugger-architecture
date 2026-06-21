import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@agentops/shared';
import { I18nProvider } from '../i18n/index.js';

// No rehydration in these tests — start from a clean session.
vi.mock('./api.js', () => ({ fetchSessionSnapshot: vi.fn().mockResolvedValue(null) }));

// Mock only the network driver; keep the real reducer/initial state.
const streamAgent = vi.fn();
vi.mock('./agent-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agent-stream.js')>();
  return { ...actual, streamAgent: (...args: unknown[]) => streamAgent(...args) };
});

import { useAgentStream } from './use-agent.js';

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

const planEvt: StreamEvent = { type: 'plan', payload: { reasoning: 'r', tasks: [] } };
const resultWithData: StreamEvent = {
  type: 'result',
  payload: {
    text: '8 sanciones firmes.',
    uiActions: [{ action: 'open_tab', tab: 'datos' }],
    evidence: [{ id: 'E1', documentTitle: 'Res. 1', passage: 'p', confidence: 'directa' }],
    artifacts: [
      {
        id: 'c1',
        kind: 'chart_data',
        producedByAgentId: 'data',
        createdAt: '2026-01-01T00:00:00.000Z',
        data: { id: 'c1', kind: 'bar', title: 't', series: [], source: 's', asOf: 'a' },
      },
    ],
    resultSummary: { completedTasks: 1, evidenceCount: 1 },
  },
};
// A planner `reply`: a `result` with no preceding `plan` and no evidence/charts.
const replyResult: StreamEvent = {
  type: 'result',
  payload: {
    text: 'Concepto explicado.',
    uiActions: [],
    evidence: [],
    artifacts: [],
    resultSummary: { completedTasks: 0, evidenceCount: 0 },
  },
};
const doneEvt: StreamEvent = { type: 'done', payload: { sessionId: 's1', status: 'completed' } };

type OnEvent = (e: StreamEvent) => void;

describe('useAgentStream — direct-reply turns clear stale canvas (Finding 1)', () => {
  it('clears evidence/charts/reportId when a new turn answers with a reply (no plan)', async () => {
    streamAgent
      .mockImplementationOnce(async (_p: string, _b: unknown, onEvent: OnEvent) => {
        onEvent(planEvt);
        onEvent(resultWithData);
        onEvent(doneEvt);
      })
      .mockImplementationOnce(async (_p: string, _b: unknown, onEvent: OnEvent) => {
        onEvent(replyResult);
        onEvent(doneEvt);
      });

    const { result } = renderHook(() => useAgentStream('s1'), { wrapper });
    await waitFor(() => expect(result.current.hydrating).toBe(false));

    // Turn 1 populates the canvas.
    await act(async () => {
      await result.current.send('sanciones de la empresa');
    });
    expect(result.current.state.evidence).toHaveLength(1);
    expect(result.current.state.charts).toHaveLength(1);

    // Turn 2 is a conceptual follow-up answered with a reply → canvas must reset.
    await act(async () => {
      await result.current.send('¿qué es una sanción firme?');
    });
    expect(result.current.state.evidence).toHaveLength(0);
    expect(result.current.state.charts).toHaveLength(0);
    expect(result.current.state.reportId).toBeUndefined();
    expect(result.current.state.requestedTab).toBeUndefined();
  });
});
