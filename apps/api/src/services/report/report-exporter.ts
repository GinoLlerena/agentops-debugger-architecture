import type { Report } from '@agentops/shared';
import { reportFileKey } from '../storage/keys.js';
import type { BlobStore } from '../storage/ports.js';
import {
  contentTypeFor,
  exportFilename,
  exportReport,
  type ExportedFile,
  type ExportFormat,
} from './export-report.js';

/**
 * Renders report files and serves them through the {@link BlobStore} (Alibaba
 * Cloud OSS in live mode, in-memory offline) — this is what puts OSS on the
 * runtime path.
 *
 * It is a **read-through cache** keyed by {@link reportFileKey}: the first export
 * of an **approved** report renders the file and uploads it; later exports of the
 * same report/format serve the stored object without re-rendering. Approved
 * reports are immutable (the HITL gate has closed), so caching them is safe.
 * **Draft** reports are still mutable, so they always render fresh and are never
 * cached — exporting a draft would otherwise pin a stale file. The returned
 * {@link ExportedFile} shape is identical either way, so the HTTP layer streams
 * it the same way regardless of backend.
 */
export class ReportExporter {
  constructor(private readonly blobs: BlobStore) {}

  async export(report: Report, format: ExportFormat): Promise<ExportedFile> {
    if (report.status !== 'approved') return exportReport(report, format);

    const key = reportFileKey(report.id, format);
    // `get` returns undefined on a miss (both backends map NoSuchKey → undefined),
    // so this is a single round-trip on a cache hit — no separate `exists` call.
    const cached = await this.blobs.get(key);
    if (cached) {
      return {
        buffer: Buffer.from(cached),
        contentType: contentTypeFor(format),
        filename: exportFilename(report.id, format),
      };
    }

    const file = await exportReport(report, format);
    await this.blobs.put(key, file.buffer, { contentType: file.contentType });
    return file;
  }
}
