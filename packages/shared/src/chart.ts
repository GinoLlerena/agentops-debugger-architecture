import { z } from 'zod';
import { Id } from './common.js';

/**
 * Chart specifications produced by agents (kind `chart_data` artifacts) and
 * rendered by the canvas. Every chart carries the question it answers, its unit,
 * and a source/freshness stamp (UX §6.2): the UI must show "API OEFA · GUID ·
 * cobertura … · consultado …". Severity is paired with icon+label, never colour
 * alone — that is the renderer's job; the spec just carries the data.
 */

export const ChartKind = z.enum(['bar', 'severity', 'timeline', 'line']);
export type ChartKind = z.infer<typeof ChartKind>;

/** A generic data point; fields are interpreted per chart kind. */
export const ChartPoint = z.object({
  label: z.string(),
  value: z.number().optional(),
  /** DD/MM/AAAA or ISO — used by the timeline. */
  date: z.string().optional(),
  /** A grouping/outcome tag (e.g. severity level, resolution status). */
  category: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});
export type ChartPoint = z.infer<typeof ChartPoint>;

export const ChartSpec = z.object({
  id: Id,
  kind: ChartKind,
  /** The question the chart answers, e.g. "¿Cuántas sanciones por año?". */
  title: z.string(),
  unit: z.string().optional(), // e.g. "UIT", "registros"
  series: z.array(ChartPoint),
  // provenance / freshness stamp
  source: z.string(), // "API OEFA · RESOL-CON-MULTA-FIRME"
  coverage: z.string().optional(), // "2019-2025"
  asOf: z.string(), // consultation date stamp
  producedByAgentId: z.string().optional(),
});
export type ChartSpec = z.infer<typeof ChartSpec>;
