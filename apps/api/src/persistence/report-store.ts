import type { Report, ReportStatus } from '@agentops/shared';
import { COLLECTIONS, type DocumentStore } from '../services/storage/index.js';

/**
 * Persistence for generated reports (FR-30, architecture §11.2). A draft is saved
 * when the ReportAgent produces it; the HITL approval flips it to `approved` (the
 * regulated side effect). Backed by the DocumentStore ports (in-memory ⇄ Tablestore).
 */
export class ReportStore {
  constructor(
    private readonly docs: DocumentStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async save(report: Report): Promise<void> {
    await this.docs.put(COLLECTIONS.reports, report.id, report);
  }

  async get(id: string): Promise<Report | undefined> {
    return this.docs.get<Report>(COLLECTIONS.reports, id);
  }

  async list(limit?: number): Promise<Report[]> {
    const docs = await this.docs.list<Report>(COLLECTIONS.reports);
    const sorted = docs.map((d) => d.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return limit != null ? sorted.slice(0, limit) : sorted;
  }

  /** Update a report's status (e.g. draft → approved on HITL approval). */
  async setStatus(id: string, status: ReportStatus): Promise<Report | undefined> {
    const report = await this.get(id);
    if (!report) return undefined;
    const next: Report = { ...report, status, updatedAt: this.clock().toISOString() };
    await this.save(next);
    return next;
  }
}
