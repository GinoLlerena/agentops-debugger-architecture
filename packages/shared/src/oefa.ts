import { z } from 'zod';
import { Id, IsoTimestamp, PeruLocation, ResolutionStatus } from './common.js';

/**
 * Normalized OEFA record — the output of `oefa-normalizer.ts` mapping Junar rows
 * (and the RUIAS CSV seed) onto a single shape. Field set derived from the RUIAS
 * data dictionary (API-verification §2). Most fields are optional because
 * coverage varies by datastream.
 */
export const OefaRecord = z.object({
  /** Stable id we assign (e.g. dataset GUID + source row key). */
  id: Id,

  // --- entity ---
  administrado: z.string(), // infractor / administered entity name
  ruc: z.string().optional(), // used for entity resolution (Reqs §3)
  unidadFiscalizable: z.string().optional(),
  location: PeruLocation.optional(),
  sector: z.string().optional(),
  subsector: z.string().optional(),

  // --- facts & legal basis ---
  hechosImputados: z.string().optional(),
  normativaIncumplida: z.string().optional(),

  // --- procedural dates ---
  supervisionStart: z.string().optional(), // ISO date or original string
  supervisionEnd: z.string().optional(),
  actoAdministrativoDate: z.string().optional(),

  // --- identifiers ---
  expediente: z.string().optional(),
  resolucionDirectoral: z.string().optional(),
  resolucionMulta: z.string().optional(),

  // --- outcome ---
  sanctionType: z.string().optional(),
  dictatedMeasure: z.string().optional(), // medida correctiva / cautelar
  recourseType: z.string().optional(),
  fineAmountUit: z.number().nonnegative().optional(),
  fineAmountSoles: z.number().nonnegative().optional(),
  uitYear: z.number().int().optional(), // year of the UIT used for conversion

  // --- risk-scoring inputs ---
  reincidencia: z.boolean().optional(),
  resolutionStatus: ResolutionStatus.default('desconocido'),

  // --- provenance (freshness stamp, FR-13) ---
  sourceDatasetId: z.string(), // e.g. "resoluciones-multa-firmes"
  sourceDatasetGuid: z.string(), // e.g. "RESOL-CON-MULTA-FIRME"
  sourceUrl: z.string().url().optional(),
  fetchedAt: IsoTimestamp,
  coverage: z.string().optional(), // e.g. "2019-2025"
  fromCache: z.boolean().default(false),
});
export type OefaRecord = z.infer<typeof OefaRecord>;

/**
 * One dataset entry in the OEFA_DATASETS config (API-verification §3).
 * `type` distinguishes a Junar datastream (row-level) from a dashboard (container).
 */
export const OefaDatasetConfig = z.object({
  id: z.string(),
  guid: z.string(),
  type: z.enum(['datastream', 'dashboard']),
  description: z.string(),
});
export type OefaDatasetConfig = z.infer<typeof OefaDatasetConfig>;

/**
 * Result of an OEFA query: records plus pagination/partial flags (FR-12) and
 * the freshness stamp (FR-13). `partial` is set when pagination was truncated
 * or the source degraded to cache (FR-14).
 */
export const OefaQueryResult = z.object({
  records: z.array(OefaRecord),
  total: z.number().int().nonnegative().optional(),
  partial: z.boolean().default(false),
  fromCache: z.boolean().default(false),
  fetchedAt: IsoTimestamp,
  datasetId: z.string(),
  coverage: z.string().optional(),
});
export type OefaQueryResult = z.infer<typeof OefaQueryResult>;
