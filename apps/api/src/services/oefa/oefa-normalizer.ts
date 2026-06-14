import { OefaRecord, type OefaDatasetConfig, type ResolutionStatus } from '@agentops/shared';
import { canonKey, parseLocaleNumber } from '../util/text.js';

/**
 * Maps raw Junar rows onto the normalized `OefaRecord` shape. Field names vary by
 * datastream and are an open item (VERIFY B-2), so lookups are **alias-based and
 * accent/case/space-insensitive**, using the RUIAS data dictionary as the column
 * reference. Object rows are supported directly; array rows need a column header
 * list (Junar sometimes returns header-as-first-row), threaded via `columns`.
 */

const ALIASES = {
  administrado: ['administrado', 'administrado_infractor', 'infractor', 'razon_social', 'nombre', 'empresa', 'nombre_administrado'],
  ruc: ['ruc', 'nro_ruc', 'numero_ruc'],
  unidadFiscalizable: ['unidad_fiscalizable', 'uf', 'nombre_uf', 'nombre_unidad_fiscalizable'],
  departamento: ['departamento', 'dpto'],
  provincia: ['provincia'],
  distrito: ['distrito'],
  sector: ['sector'],
  subsector: ['subsector', 'sub_sector'],
  hechosImputados: ['hechos_imputados', 'hechos', 'hecho_imputado', 'conducta_infractora'],
  normativaIncumplida: ['normativa_incumplida', 'norma_incumplida', 'normativa', 'base_normativa'],
  supervisionStart: ['fecha_inicio_supervision', 'inicio_supervision', 'fecha_supervision_inicio'],
  supervisionEnd: ['fecha_fin_supervision', 'fin_supervision'],
  actoAdministrativoDate: ['fecha_acto_administrativo', 'fecha_acto', 'fecha_resolucion'],
  expediente: ['expediente', 'nro_expediente', 'numero_expediente'],
  resolucionDirectoral: ['resolucion_directoral', 'res_directoral'],
  resolucionMulta: ['resolucion_multa', 'resolucion_de_multa', 'res_multa', 'resolucion'],
  sanctionType: ['tipo_sancion', 'sancion', 'tipo_de_sancion'],
  dictatedMeasure: ['medida_dictada', 'medida', 'tipo_medida', 'medida_correctiva'],
  recourseType: ['tipo_recurso', 'recurso', 'recurso_impugnatorio'],
  fineAmountUit: ['multa_uit', 'monto_uit', 'sancion_uit', 'uit'],
  fineAmountSoles: ['multa_soles', 'monto_soles', 'sancion_soles', 'soles'],
  reincidencia: ['reincidencia', 'reincidente'],
  resolutionStatus: ['estado', 'estado_resolucion', 'condicion', 'situacion'],
  id: ['id', 'codigo', 'row_id'],
} as const;

type CanonRow = Record<string, unknown>;

function toCanonRow(row: unknown, columns?: string[]): CanonRow {
  if (Array.isArray(row) && columns) {
    const out: CanonRow = {};
    columns.forEach((col, i) => {
      out[canonKey(col)] = row[i];
    });
    return out;
  }
  if (row && typeof row === 'object') {
    const out: CanonRow = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[canonKey(k)] = v;
    return out;
  }
  return {};
}

function pickString(row: CanonRow, aliases: readonly string[]): string | undefined {
  for (const a of aliases) {
    const v = row[a];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

function pickNumber(row: CanonRow, aliases: readonly string[]): number | undefined {
  const s = pickString(row, aliases);
  if (s == null) return undefined;
  // locale-aware: infer whether ','/'.' is the decimal vs thousands separator.
  return parseLocaleNumber(s);
}

function pickBoolean(row: CanonRow, aliases: readonly string[]): boolean | undefined {
  const s = pickString(row, aliases);
  if (s == null) return undefined;
  const v = canonKey(s);
  if (['si', 'true', '1', 'verdadero', 'x'].includes(v)) return true;
  if (['no', 'false', '0', 'falso'].includes(v)) return false;
  return undefined;
}

export function normalizeResolutionStatus(raw: string | undefined): ResolutionStatus {
  if (!raw) return 'desconocido';
  const v = canonKey(raw);
  // Check non-firm statuses first, and require firmness to not be negated
  // ("no firme" / "aún no firme" must not classify as firme).
  if (v.includes('apel')) return 'apelada';
  if (v.includes('anulad')) return 'anulada';
  if (v.includes('archiv')) return 'archivada';
  if (v.includes('proceso') || v.includes('tramite')) return 'en_proceso';
  const negated = /(^|_)no(_|$)/.test(v) || v.includes('no_firme');
  if (!negated && (v.includes('firme') || v.includes('consentid'))) return 'firme';
  if (v.includes('firme') || v.includes('consentid')) return 'en_proceso'; // "no firme" → still in process
  return 'desconocido';
}

/** Map one raw row → OefaRecord (validated by the zod schema before return). */
export function normalizeRow(
  row: unknown,
  dataset: OefaDatasetConfig,
  index: number,
  opts: { fetchedAt: string; coverage?: string; fromCache?: boolean; columns?: string[] },
): OefaRecord {
  const r = toCanonRow(row, opts.columns);
  const rowId = pickString(r, ALIASES.id) ?? String(index);

  const departamento = pickString(r, ALIASES.departamento);
  const provincia = pickString(r, ALIASES.provincia);
  const distrito = pickString(r, ALIASES.distrito);
  const location =
    departamento || provincia || distrito ? { departamento, provincia, distrito } : undefined;

  return OefaRecord.parse({
    id: `${dataset.guid}:${rowId}`,
    administrado: pickString(r, ALIASES.administrado) ?? 'Administrado no identificado',
    ruc: pickString(r, ALIASES.ruc),
    unidadFiscalizable: pickString(r, ALIASES.unidadFiscalizable),
    location,
    sector: pickString(r, ALIASES.sector),
    subsector: pickString(r, ALIASES.subsector),
    hechosImputados: pickString(r, ALIASES.hechosImputados),
    normativaIncumplida: pickString(r, ALIASES.normativaIncumplida),
    supervisionStart: pickString(r, ALIASES.supervisionStart),
    supervisionEnd: pickString(r, ALIASES.supervisionEnd),
    actoAdministrativoDate: pickString(r, ALIASES.actoAdministrativoDate),
    expediente: pickString(r, ALIASES.expediente),
    resolucionDirectoral: pickString(r, ALIASES.resolucionDirectoral),
    resolucionMulta: pickString(r, ALIASES.resolucionMulta),
    sanctionType: pickString(r, ALIASES.sanctionType),
    dictatedMeasure: pickString(r, ALIASES.dictatedMeasure),
    recourseType: pickString(r, ALIASES.recourseType),
    fineAmountUit: pickNumber(r, ALIASES.fineAmountUit),
    fineAmountSoles: pickNumber(r, ALIASES.fineAmountSoles),
    reincidencia: pickBoolean(r, ALIASES.reincidencia),
    resolutionStatus: normalizeResolutionStatus(pickString(r, ALIASES.resolutionStatus)),
    sourceDatasetId: dataset.id,
    sourceDatasetGuid: dataset.guid,
    fetchedAt: opts.fetchedAt,
    coverage: opts.coverage,
    fromCache: opts.fromCache ?? false,
  });
}

export interface NormalizeRowsResult {
  records: OefaRecord[];
  /** Count of rows that failed to normalize (skipped, not thrown). */
  skipped: number;
}

/**
 * Normalize a batch of rows. A row that fails validation is **skipped**, not
 * thrown — dirty source data must not abort the whole dataset (FR-14 posture).
 * Use {@link normalizeRows} for the records-only convenience form.
 */
export function normalizeRowsSafe(
  rows: unknown[],
  dataset: OefaDatasetConfig,
  opts: { fetchedAt: string; coverage?: string; fromCache?: boolean; columns?: string[] },
): NormalizeRowsResult {
  const records: OefaRecord[] = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    try {
      records.push(normalizeRow(row, dataset, i, opts));
    } catch {
      skipped++; // malformed row (e.g. negative fine) — skip, keep the rest
    }
  });
  return { records, skipped };
}

export function normalizeRows(
  rows: unknown[],
  dataset: OefaDatasetConfig,
  opts: { fetchedAt: string; coverage?: string; fromCache?: boolean; columns?: string[] },
): OefaRecord[] {
  return normalizeRowsSafe(rows, dataset, opts).records;
}
