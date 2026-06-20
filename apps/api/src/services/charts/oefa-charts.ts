import {
  DEFAULT_LANGUAGE,
  RESOLUTION_STATUS_LABELS,
  localizeLabel,
  type ChartSpec,
  type Language,
  type OefaRecord,
} from '@agentops/shared';
import { recordYear } from '../oefa/oefa-service.js';
import { messages } from '../../i18n/messages.js';

/**
 * Build chart specs from a set of normalized OEFA records (the agent emits these
 * as `chart_data` artifacts; the canvas renders them). Each carries the source +
 * coverage + as-of stamp so the chart can show "API OEFA · GUID · cobertura … ·
 * consultado …" (UX §6.2).
 */
export interface ChartContext {
  source: string; // e.g. "API OEFA · RESOL-CON-MULTA-FIRME"
  coverage?: string;
  asOf: string; // DD/MM/AAAA or ISO
  producedByAgentId?: string;
  entityLabel?: string; // for chart titles ("… de La Pampilla")
  language?: Language; // titles/units localized to the run's language
}

const STATUS_ORDER = ['firme', 'apelada', 'en_proceso', 'anulada', 'archivada', 'desconocido'];

export function buildOefaCharts(records: OefaRecord[], ctx: ChartContext): ChartSpec[] {
  if (records.length === 0) return [];
  const language = ctx.language ?? DEFAULT_LANGUAGE;
  const m = messages(language);
  const charts: ChartSpec[] = [];
  const stamp = { source: ctx.source, coverage: ctx.coverage, asOf: ctx.asOf, producedByAgentId: ctx.producedByAgentId };

  // C2 — sanciones (UIT) por año. Only count years with a known fine, so a year
  // whose fines are all unknown doesn't render a misleading "confirmed 0 UIT" bar.
  const byYearUit = new Map<number, number>();
  for (const r of records) {
    const y = recordYear(r);
    if (y == null || r.fineAmountUit == null) continue;
    byYearUit.set(y, (byYearUit.get(y) ?? 0) + r.fineAmountUit);
  }
  if (byYearUit.size > 0) {
    charts.push({
      id: 'oefa-sanciones-por-anio',
      kind: 'bar',
      title: m.chartFinesByYear,
      unit: 'UIT',
      series: [...byYearUit.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, uit]) => ({ label: String(year), value: uit })),
      ...stamp,
    });
  }

  // C5 — distribución por estado de resolución (firmeza)
  const byStatus = new Map<string, number>();
  for (const r of records) byStatus.set(r.resolutionStatus, (byStatus.get(r.resolutionStatus) ?? 0) + 1);
  if (byStatus.size > 0) {
    // Known statuses in canonical order, then any status not in STATUS_ORDER, so a
    // new/unknown resolution status is never silently dropped from the chart.
    const ordered = [
      ...STATUS_ORDER.filter((s) => byStatus.has(s)),
      ...[...byStatus.keys()].filter((s) => !STATUS_ORDER.includes(s)),
    ];
    charts.push({
      id: 'oefa-distribucion-estado',
      kind: 'severity',
      title: m.chartStatusDistribution,
      unit: m.unitRecords,
      // label localized for display; category stays the canonical status key (color mapping).
      series: ordered.map((s) => ({
        label: localizeLabel(RESOLUTION_STATUS_LABELS, s, language),
        value: byStatus.get(s)!,
        category: s,
      })),
      ...stamp,
    });
  }

  // C1 — línea de tiempo procesal (milestones from records, chronological).
  // Precompute the sort key once and drop milestones whose date is unparseable
  // (key 0) so they don't sort to the front and corrupt the order.
  const milestones = records
    .map((r) => {
      const date = r.actoAdministrativoDate ?? r.supervisionEnd ?? r.supervisionStart;
      return { r, date, key: date ? parseDdmmyyyy(date) : 0 };
    })
    .filter((m) => m.key > 0)
    .sort((a, b) => a.key - b.key);
  if (milestones.length > 0) {
    charts.push({
      id: 'oefa-linea-de-tiempo',
      kind: 'timeline',
      title: ctx.entityLabel ? m.chartTimelineEntity(ctx.entityLabel) : m.chartTimeline,
      series: milestones.map(({ r, date }) => ({
        label: r.resolucionMulta ?? r.resolucionDirectoral ?? r.expediente ?? m.timelineFallbackLabel,
        date,
        category: r.resolutionStatus,
        value: r.fineAmountUit,
        meta: { administrado: r.administrado, hechos: r.hechosImputados },
      })),
      ...stamp,
    });
  }

  return charts;
}

/** Parse DD/MM/AAAA (or a leading year) to a sortable number; 0 if unknown. */
function parseDdmmyyyy(s: string): number {
  const ddmmyyyy = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) return Number(`${ddmmyyyy[3]}${ddmmyyyy[2]}${ddmmyyyy[1]}`);
  const year = s.match(/(19|20)\d{2}/);
  return year ? Number(`${year[0]}0000`) : 0;
}
