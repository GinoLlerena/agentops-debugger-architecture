import type { ChartSpec, OefaRecord } from '@agentops/shared';
import { recordYear } from '../oefa/oefa-service.js';

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
}

const STATUS_ORDER = ['firme', 'apelada', 'en_proceso', 'anulada', 'archivada', 'desconocido'];

export function buildOefaCharts(records: OefaRecord[], ctx: ChartContext): ChartSpec[] {
  if (records.length === 0) return [];
  const charts: ChartSpec[] = [];
  const stamp = { source: ctx.source, coverage: ctx.coverage, asOf: ctx.asOf, producedByAgentId: ctx.producedByAgentId };

  // C2 — sanciones (UIT) por año
  const byYearUit = new Map<number, number>();
  for (const r of records) {
    const y = recordYear(r);
    if (y == null) continue;
    byYearUit.set(y, (byYearUit.get(y) ?? 0) + (r.fineAmountUit ?? 0));
  }
  if (byYearUit.size > 0) {
    charts.push({
      id: 'oefa-sanciones-por-anio',
      kind: 'bar',
      title: '¿Cuánto suma la multa por año?',
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
    charts.push({
      id: 'oefa-distribucion-estado',
      kind: 'severity',
      title: '¿Cómo se distribuyen las resoluciones por estado?',
      unit: 'registros',
      series: STATUS_ORDER.filter((s) => byStatus.has(s)).map((s) => ({
        label: s,
        value: byStatus.get(s)!,
        category: s,
      })),
      ...stamp,
    });
  }

  // C1 — línea de tiempo procesal (milestones from records, chronological)
  const milestones = records
    .map((r) => ({ r, date: r.actoAdministrativoDate ?? r.supervisionEnd ?? r.supervisionStart }))
    .filter((m) => m.date)
    .sort((a, b) => parseDdmmyyyy(a.date!) - parseDdmmyyyy(b.date!));
  if (milestones.length > 0) {
    charts.push({
      id: 'oefa-linea-de-tiempo',
      kind: 'timeline',
      title: ctx.entityLabel ? `Línea de tiempo procesal · ${ctx.entityLabel}` : 'Línea de tiempo procesal',
      series: milestones.map(({ r, date }) => ({
        label: r.resolucionMulta ?? r.resolucionDirectoral ?? r.expediente ?? 'Acto administrativo',
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
