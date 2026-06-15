import type { OefaQueryResult, OefaRecord, ResolutionStatus } from '@agentops/shared';
import {
  DATASET_COVERAGE,
  getDataset,
  OEFA_DATASETS,
  type OefaDatasetKey,
} from './datasets.js';
import { cacheKey, InMemoryOefaCache, type OefaCache } from './oefa-cache.js';
import { JunarClient } from './junar-client.js';
import { normalizeRowsSafe } from './oefa-normalizer.js';
import { normalizeText as norm } from '../util/text.js';

function parseYear(...dates: Array<string | undefined>): number | undefined {
  for (const d of dates) {
    if (!d) continue;
    const m = d.match(/(19|20)\d{2}/);
    if (m) return Number(m[0]);
  }
  return undefined;
}

export function recordYear(r: OefaRecord): number | undefined {
  return parseYear(
    r.actoAdministrativoDate,
    r.supervisionEnd,
    r.supervisionStart,
    r.uitYear ? String(r.uitYear) : undefined,
  );
}

const RUC_RE = /^\d{11}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Record sources: where normalized records come from (live API or offline seed).
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchedRecords {
  records: OefaRecord[];
  total?: number;
  partial: boolean;
}

export interface OefaRecordSource {
  fetchRecords(datasetKey: OefaDatasetKey, opts?: { maxRows?: number }): Promise<FetchedRecords>;
}

/** Live source: Junar client → normalizer. Datastreams only (dashboards have no rows). */
export class JunarRecordSource implements OefaRecordSource {
  constructor(
    private readonly client: JunarClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetchRecords(
    datasetKey: OefaDatasetKey,
    opts: { maxRows?: number } = {},
  ): Promise<FetchedRecords> {
    const dataset = getDataset(datasetKey);
    if (dataset.type !== 'datastream') {
      throw new Error(`El dataset "${dataset.id}" es un dashboard; no expone filas.`);
    }
    const { rows, total, partial, columns } = await this.client.getDatastreamRows(dataset.guid, {
      maxRows: opts.maxRows ?? 500,
    });
    const { records } = normalizeRowsSafe(rows, dataset, {
      fetchedAt: this.clock().toISOString(),
      coverage: DATASET_COVERAGE[datasetKey],
      fromCache: false,
      columns, // header row threaded for array-of-arrays datastreams
    });
    return { records, total, partial };
  }
}

/** Offline source: pre-normalized seed records (works with the API down). */
export class SeedRecordSource implements OefaRecordSource {
  constructor(private readonly seed: OefaRecord[]) {}

  async fetchRecords(datasetKey: OefaDatasetKey): Promise<FetchedRecords> {
    const guid = getDataset(datasetKey).guid;
    // Seed is modeled on RESOL-CON-MULTA-FIRME; serve it for that datastream.
    const records =
      guid === OEFA_DATASETS.resolucionesMultaFirmes.guid
        ? this.seed
        : this.seed.filter((r) => r.sourceDatasetGuid === guid);
    return { records, total: records.length, partial: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters, aggregates, and entity resolution.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordFilter {
  administrado?: string;
  ruc?: string;
  sector?: string;
  region?: string; // departamento
  yearFrom?: number;
  yearTo?: number;
  status?: ResolutionStatus;
  infraction?: string; // matches hechosImputados / normativaIncumplida
}

export function applyFilter(records: OefaRecord[], f: RecordFilter): OefaRecord[] {
  return records.filter((r) => {
    if (f.ruc && r.ruc !== f.ruc) return false;
    if (f.administrado && !norm(r.administrado).includes(norm(f.administrado))) return false;
    if (f.sector && norm(r.sector ?? '') !== norm(f.sector)) return false;
    if (f.region && norm(r.location?.departamento ?? '') !== norm(f.region)) return false;
    if (f.status && r.resolutionStatus !== f.status) return false;
    if (f.infraction) {
      const hay = norm(`${r.hechosImputados ?? ''} ${r.normativaIncumplida ?? ''}`);
      if (!hay.includes(norm(f.infraction))) return false;
    }
    if (f.yearFrom != null || f.yearTo != null) {
      const y = recordYear(r);
      if (y == null) return false;
      if (f.yearFrom != null && y < f.yearFrom) return false;
      if (f.yearTo != null && y > f.yearTo) return false;
    }
    return true;
  });
}

export interface EntityCandidate {
  administrado: string;
  ruc?: string;
  sector?: string;
  recordCount: number;
}

export interface CompanyStats {
  totalRecords: number;
  withSanction: number;
  sumFineUit: number;
  sumFineSoles: number;
  firmCount: number;
  openCount: number;
  reincidencia: boolean;
  sectors: string[];
  byYear: Record<string, number>;
}

export interface CompanyProfile {
  entity: { administrado: string; ruc?: string };
  records: OefaRecord[];
  stats: CompanyStats;
  dataAsOf: string;
  fromCache: boolean;
  coverage?: string;
}

export type CompanyProfileResult =
  | { status: 'ok'; profile: CompanyProfile }
  | { status: 'ambiguous'; candidates: EntityCandidate[] }
  | { status: 'not_found'; query: string };

function entityKey(r: OefaRecord): string {
  return r.ruc ?? norm(r.administrado);
}

export function distinctEntities(records: OefaRecord[]): EntityCandidate[] {
  const map = new Map<string, EntityCandidate>();
  for (const r of records) {
    const k = entityKey(r);
    const existing = map.get(k);
    if (existing) existing.recordCount++;
    else
      map.set(k, { administrado: r.administrado, ruc: r.ruc, sector: r.sector, recordCount: 1 });
  }
  return [...map.values()].sort((a, b) => b.recordCount - a.recordCount);
}

export function computeStats(records: OefaRecord[]): CompanyStats {
  const byYear: Record<string, number> = {};
  let sumFineUit = 0;
  let sumFineSoles = 0;
  let withSanction = 0;
  let firmCount = 0;
  let openCount = 0;
  let reincidencia = false;
  const sectors = new Set<string>();

  for (const r of records) {
    if (r.fineAmountUit != null) sumFineUit += r.fineAmountUit;
    if (r.fineAmountSoles != null) sumFineSoles += r.fineAmountSoles;
    if (r.fineAmountUit != null || r.sanctionType) withSanction++;
    if (r.resolutionStatus === 'firme') firmCount++;
    if (r.resolutionStatus === 'en_proceso' || r.resolutionStatus === 'apelada') openCount++;
    if (r.reincidencia) reincidencia = true;
    if (r.sector) sectors.add(r.sector);
    const y = recordYear(r);
    if (y != null) byYear[y] = (byYear[y] ?? 0) + 1;
  }

  return {
    totalRecords: records.length,
    withSanction,
    sumFineUit,
    sumFineSoles,
    firmCount,
    openCount,
    reincidencia,
    sectors: [...sectors],
    byYear,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The service.
// ─────────────────────────────────────────────────────────────────────────────

export class OefaService {
  constructor(
    private readonly source: OefaRecordSource,
    private readonly cache: OefaCache = new InMemoryOefaCache(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Fetch a dataset's normalized records with cache fallback (FR-13/FR-14).
   * On source failure, serve the cached copy stamped `fromCache: true`; if there
   * is no cache, the error propagates (nothing truthful to show).
   */
  async getRecords(
    datasetKey: OefaDatasetKey = 'resolucionesMultaFirmes',
    opts: { maxRows?: number } = {},
  ): Promise<OefaQueryResult> {
    const dataset = getDataset(datasetKey);
    const key = cacheKey(dataset.id);
    const coverage = DATASET_COVERAGE[datasetKey];
    try {
      const { records, total, partial } = await this.source.fetchRecords(datasetKey, opts);
      const fetchedAt = this.clock().toISOString();
      await this.cache.set(key, { records, total, fetchedAt, coverage });
      return { records, total, partial, fromCache: false, fetchedAt, datasetId: dataset.id, coverage };
    } catch (err) {
      const cached = await this.cache.get(key);
      if (!cached) throw err;
      return {
        records: cached.records.map((r) => ({ ...r, fromCache: true })),
        total: cached.total,
        partial: false,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        datasetId: dataset.id,
        coverage: cached.coverage ?? coverage,
      };
    }
  }

  /** Search records (in-memory filtering over the core dataset). */
  async searchRecords(
    filter: RecordFilter = {},
    datasetKey: OefaDatasetKey = 'resolucionesMultaFirmes',
  ): Promise<OefaQueryResult> {
    const base = await this.getRecords(datasetKey);
    return { ...base, records: applyFilter(base.records, filter), total: undefined };
  }

  /**
   * Resolve an entity by RUC or name and build its profile. Returns `ambiguous`
   * with candidate entities when a name matches more than one administrado —
   * the agent must clarify rather than guess (Reqs §3, UX §9).
   */
  async getCompanyProfile(
    query: string,
    datasetKey: OefaDatasetKey = 'resolucionesMultaFirmes',
  ): Promise<CompanyProfileResult> {
    const base = await this.getRecords(datasetKey);
    const q = query.trim();
    const matches = RUC_RE.test(q)
      ? base.records.filter((r) => r.ruc === q)
      : applyFilter(base.records, { administrado: q });

    if (matches.length === 0) return { status: 'not_found', query: q };

    const entities = distinctEntities(matches);
    if (entities.length > 1) return { status: 'ambiguous', candidates: entities };

    const entity = entities[0]!;
    return {
      status: 'ok',
      profile: {
        entity: { administrado: entity.administrado, ruc: entity.ruc },
        records: matches,
        stats: computeStats(matches),
        dataAsOf: base.fetchedAt,
        fromCache: base.fromCache,
        coverage: base.coverage,
      },
    };
  }
}
