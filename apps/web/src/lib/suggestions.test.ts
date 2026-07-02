import { describe, expect, it } from 'vitest';
import type { ChartSpec } from '@agentops/shared';
import { initialChatState, type ChatState } from './agent-stream.js';
import { entityFromCharts, suggestionsFor } from './suggestions.js';

const timelineChart: ChartSpec = {
  id: 'oefa-linea-de-tiempo',
  kind: 'timeline',
  title: 'Línea de tiempo procesal · Minera Las Bambas S.A.',
  series: [
    {
      label: 'RES 123-2023',
      date: '10/02/2023',
      meta: { administrado: 'Minera Las Bambas S.A.' },
    },
  ],
  source: 'API OEFA · RESOL-CON-MULTA-FIRME',
  asOf: '2026-07-02',
};

function state(over: Partial<ChatState>): ChatState {
  return {
    ...initialChatState,
    messages: [{ id: 'm1', kind: 'user', text: 'q' }],
    ...over,
  };
}

describe('entityFromCharts', () => {
  it('reads the administrado from the timeline chart point meta', () => {
    expect(entityFromCharts(state({ charts: [timelineChart] }))).toBe('Minera Las Bambas S.A.');
  });

  it('returns undefined without a timeline chart or meta', () => {
    expect(entityFromCharts(state({}))).toBeUndefined();
    const bare = { ...timelineChart, series: [{ label: 'x' }] };
    expect(entityFromCharts(state({ charts: [bare] }))).toBeUndefined();
  });
});

describe('suggestionsFor', () => {
  it('offers nothing while idle/empty, running, waiting or failed', () => {
    expect(suggestionsFor(initialChatState)).toEqual([]);
    expect(suggestionsFor(state({ status: 'running' }))).toEqual([]);
    expect(suggestionsFor(state({ status: 'waiting' }))).toEqual([]);
    expect(suggestionsFor(state({ status: 'failed' }))).toEqual([]);
  });

  it('after a cited answer (Flow B) suggests the report for the same entity, then the listing', () => {
    const s = suggestionsFor(state({ status: 'completed', charts: [timelineChart] }));
    expect(s).toEqual([
      { key: 'workspace.suggestReportFor', params: { entity: 'Minera Las Bambas S.A.' } },
      { key: 'workspace.suggestListing' },
    ]);
  });

  it('after a report (Flow A) suggests starting a new listing cycle', () => {
    const s = suggestionsFor(
      state({ status: 'completed', reportId: 'report-1', charts: [timelineChart] }),
    );
    expect(s).toEqual([{ key: 'workspace.suggestListing' }]);
  });

  it('falls back to the listing when no entity is derivable', () => {
    expect(suggestionsFor(state({ status: 'completed' }))).toEqual([
      { key: 'workspace.suggestListing' },
    ]);
  });
});
