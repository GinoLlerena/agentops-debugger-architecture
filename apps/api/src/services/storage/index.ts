import { getEnv, isOssConfigured, isTablestoreConfigured, type Env } from '../../config/env.js';
import { InMemoryBlobStore, InMemoryDocumentStore } from './in-memory-store.js';
import type { Stores } from './ports.js';

export * from './ports.js';
export * from './keys.js';
export { InMemoryBlobStore, InMemoryDocumentStore } from './in-memory-store.js';

/**
 * Build the storage layer for the current environment. Uses Alibaba Cloud
 * (Tablestore + OSS) when configured; otherwise falls back to in-memory stores
 * so the app runs end-to-end offline. The concrete-client modules are imported
 * lazily so the SDKs aren't loaded when running purely in-memory.
 */
export async function createStores(env: Env = getEnv()): Promise<Stores> {
  const documents = isTablestoreConfigured(env)
    ? new (await import('./tablestore-client.js')).TablestoreDocumentStore(env)
    : new InMemoryDocumentStore();

  const blobs = isOssConfigured(env)
    ? new (await import('./oss-client.js')).OssBlobStore(env)
    : new InMemoryBlobStore();

  return { documents, blobs };
}
