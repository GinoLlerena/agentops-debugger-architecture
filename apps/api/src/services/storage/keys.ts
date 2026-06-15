/**
 * Storage collections + hierarchical key builders (architecture §11.2).
 * Collections map to a Tablestore partition prefix; ids use `:`-delimited
 * hierarchical keys so related rows sort together (e.g. ledger by session).
 */
export const COLLECTIONS = {
  sessions: 'session',
  reports: 'report',
  ledger: 'ledger',
  chunks: 'doc_chunk',
  snapshots: 'workflow_snapshot',
  oefaCache: 'oefa_cache',
  documents: 'document',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const ledgerId = (sessionId: string, seq: number): string =>
  `${sessionId}:${String(seq).padStart(8, '0')}`;

export const chunkId = (documentId: string, index: number): string =>
  `${documentId}:${String(index).padStart(5, '0')}`;

/** Blob object keys for OSS. */
export const uploadedDocKey = (documentId: string, filename: string): string =>
  `uploads/${documentId}/${filename}`;

export const reportFileKey = (reportId: string, ext: 'pdf' | 'docx' | 'xlsx'): string =>
  `reports/${reportId}/informe.${ext}`;
