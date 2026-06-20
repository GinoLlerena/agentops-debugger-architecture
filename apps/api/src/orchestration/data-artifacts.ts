import type { ArtifactRecord, Language, OefaRecord } from '@agentops/shared';
import type { CompanyStats } from '../services/oefa/oefa-service.js';
import { buildOefaCharts } from '../services/charts/oefa-charts.js';
import { foldAccents } from '../services/util/text.js';

/**
 * Deterministic data-layer helpers shared by the offline and live Data agents.
 * Resolving the entity and materializing the `record_set` + `chart_data`
 * artifacts is pure, auditable work over the OEFA service — the LLM (live mode)
 * provides the narrative, but the structured artifacts the canvas/report depend
 * on are built the same way in both modes so they are never empty.
 */

function clean(text: string): string[] {
  return foldAccents(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/** Pick an entity query from a free-text question: an 11-digit RUC wins (only if it
 *  matches a known record); else the longest query token present in some administrado name. */
export function entityQueryFor(question: string, records: OefaRecord[]): string {
  // Only treat an 11-digit run as a RUC if it actually matches a known record —
  // otherwise a stray document id / number would shadow a company name present
  // in the same question.
  const ruc = question.match(/\b\d{11}\b/);
  if (ruc && records.some((r) => r.ruc === ruc[0])) return ruc[0];
  const nameTokens = new Set(records.flatMap((r) => clean(r.administrado)));
  const candidates = clean(question)
    .filter((t) => nameTokens.has(t))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? question;
}

/** Build the `record_set` + `chart_data` artifacts for a resolved administrado. */
export function buildDataArtifacts(params: {
  entity: { administrado: string; ruc?: string };
  records: OefaRecord[];
  stats: CompanyStats;
  source: string;
  coverage?: string;
  asOf: string;
  producedByAgentId: string;
  language?: Language;
}): ArtifactRecord[] {
  const { entity, records, stats, source, coverage, asOf, producedByAgentId, language } = params;
  const recordSet: ArtifactRecord = {
    id: `records:${entity.ruc ?? entity.administrado}`,
    kind: 'record_set',
    producedByAgentId,
    createdAt: asOf,
    summary: `${records.length} registros de ${entity.administrado}`,
    data: { records, stats },
  };
  // Chart specs → chart_data artifacts the canvas renders (agent-driven UI).
  const chartArtifacts: ArtifactRecord[] = buildOefaCharts(records, {
    source,
    coverage,
    asOf,
    producedByAgentId,
    entityLabel: entity.administrado,
    language,
  }).map((chart) => ({
    id: chart.id,
    kind: 'chart_data',
    producedByAgentId,
    createdAt: asOf,
    summary: chart.title,
    data: chart,
  }));
  return [recordSet, ...chartArtifacts];
}
