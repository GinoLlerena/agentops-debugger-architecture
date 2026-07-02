import type { ChatState } from './agent-stream.js';
import type { MessageKey } from '../i18n/es.js';

/**
 * State-aware composer suggestions (the "what can I ask next?" chips). Pure and
 * deterministic — derived from the folded ChatState, never from an extra LLM
 * call — so they are instant, cost nothing, and always correctly localized via
 * the regular catalog. The empty-session starters are separate (Workspace's
 * empty state); these chips guide the NEXT step after a turn settles.
 */
export interface Suggestion {
  key: MessageKey;
  params?: Record<string, string>;
}

/** The administrado the turn's charts describe, read from the timeline chart's
 *  structural point meta (set deterministically in both live and offline modes). */
export function entityFromCharts(state: ChatState): string | undefined {
  for (const chart of state.charts) {
    if (chart.kind !== 'timeline') continue;
    for (const point of chart.series) {
      const administrado = (point.meta as { administrado?: unknown } | undefined)?.administrado;
      if (typeof administrado === 'string' && administrado.trim()) return administrado;
    }
  }
  return undefined;
}

export function suggestionsFor(state: ChatState): Suggestion[] {
  // Only a settled, successful turn earns next-step chips: while running/waiting
  // the HITL cards drive the flow, and a failed turn shouldn't be built upon.
  if (state.status !== 'completed' || state.messages.length === 0) return [];
  // Flow A finished (report drafted/approved) → suggest starting a new cycle.
  if (state.reportId) return [{ key: 'workspace.suggestListing' }];
  // Flow B finished with cited data → suggest the report for the same entity.
  const entity = entityFromCharts(state);
  if (entity) {
    return [
      { key: 'workspace.suggestReportFor', params: { entity } },
      { key: 'workspace.suggestListing' },
    ];
  }
  return [{ key: 'workspace.suggestListing' }];
}
