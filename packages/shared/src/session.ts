import { z } from 'zod';
import { Id, IsoTimestamp } from './common.js';
import { SubjectEntity } from './report.js';

/** A compact summary pinned to the top of the canvas Resumen tab (UX §4.6). */
export const ResultSummary = z.object({
  title: z.string(),
  stats: z.array(z.string()).max(3).default([]), // ≤3 lines of stats
  keyFinding: z.string().optional(),
  riskLevel: z.string().optional(),
  evidenceCount: z.number().int().nonnegative().default(0),
});
export type ResultSummary = z.infer<typeof ResultSummary>;

/**
 * Session — an "investigación" / expediente (UX §3). The canvas remembers state;
 * the chat is a derived log.
 */
export const Session = z.object({
  id: Id,
  title: z.string(),
  status: z.enum(['active', 'archived']).default('active'),
  subjectEntity: SubjectEntity.optional(),
  lastResultSummary: ResultSummary.optional(),
  reportIds: z.array(Id).default([]),
  messageCount: z.number().int().nonnegative().default(0),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type Session = z.infer<typeof Session>;
