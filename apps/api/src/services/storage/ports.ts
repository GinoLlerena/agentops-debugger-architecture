/**
 * Storage ports — the orchestrator and services depend on these interfaces, not
 * on any SDK. An in-memory implementation backs offline tests and local dev; the
 * Alibaba Cloud Tablestore/OSS implementations satisfy the same contracts in
 * production (and are the Alibaba-usage proof files).
 */

export interface StoredDoc<T = unknown> {
  id: string;
  value: T;
}

/**
 * A keyed JSON document store. Documents live in named `collection`s
 * (sessions, reports, ledger_events, doc_chunks, workflow_snapshots, …) and are
 * addressed by id. `list` supports an id prefix for hierarchical keys such as
 * `ledger:{sessionId}:{seq}`.
 */
export interface DocumentStore {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  list<T>(collection: string, opts?: { prefix?: string; limit?: number }): Promise<StoredDoc<T>[]>;
}

export interface PutBlobResult {
  key: string;
}

/**
 * A blob store for uploaded documents and generated report files. `getSignedUrl`
 * returns a temporary, time-limited URL (reports are served via signed URLs, not
 * public objects).
 */
export interface BlobStore {
  put(
    key: string,
    data: Uint8Array | string,
    opts?: { contentType?: string },
  ): Promise<PutBlobResult>;
  get(key: string): Promise<Uint8Array | undefined>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface Stores {
  documents: DocumentStore;
  blobs: BlobStore;
}
