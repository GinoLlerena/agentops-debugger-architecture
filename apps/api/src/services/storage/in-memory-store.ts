import type { BlobStore, DocumentStore, PutBlobResult, StoredDoc } from './ports.js';

/** Deep-clone on read/write so callers can't mutate stored state by reference. */
function clone<T>(v: T): T {
  return structuredClone(v);
}

/** In-memory DocumentStore — offline tests and local dev. */
export class InMemoryDocumentStore implements DocumentStore {
  private readonly data = new Map<string, Map<string, unknown>>();

  private col(collection: string): Map<string, unknown> {
    let c = this.data.get(collection);
    if (!c) {
      c = new Map();
      this.data.set(collection, c);
    }
    return c;
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const v = this.col(collection).get(id);
    return v === undefined ? undefined : clone(v as T);
  }

  async put<T>(collection: string, id: string, value: T): Promise<void> {
    this.col(collection).set(id, clone(value));
  }

  async delete(collection: string, id: string): Promise<void> {
    this.col(collection).delete(id);
  }

  async list<T>(
    collection: string,
    opts: { prefix?: string; limit?: number } = {},
  ): Promise<StoredDoc<T>[]> {
    const out: StoredDoc<T>[] = [];
    for (const [id, value] of this.col(collection)) {
      if (opts.prefix && !id.startsWith(opts.prefix)) continue;
      out.push({ id, value: clone(value as T) });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return opts.limit != null ? out.slice(0, opts.limit) : out;
  }
}

/** In-memory BlobStore — returns a non-network `memory://` URL for signed URLs. */
export class InMemoryBlobStore implements BlobStore {
  private readonly data = new Map<string, { bytes: Uint8Array; contentType?: string }>();

  async put(
    key: string,
    data: Uint8Array | string,
    opts: { contentType?: string } = {},
  ): Promise<PutBlobResult> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.data.set(key, { bytes, contentType: opts.contentType });
    return { key };
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.data.get(key)?.bytes;
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async getSignedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    if (!this.data.has(key)) throw new Error(`Blob no encontrado: ${key}`);
    return `memory://${key}?expires=${expiresSeconds}`;
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
