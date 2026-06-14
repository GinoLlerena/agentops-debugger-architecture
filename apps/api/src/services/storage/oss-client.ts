import OSS from 'ali-oss';
import { getEnv, isOssConfigured, type Env } from '../../config/env.js';
import type { BlobStore, PutBlobResult } from './ports.js';

/**
 * Alibaba Cloud OSS implementation of {@link BlobStore} — an Alibaba-usage proof
 * file. Stores uploaded documents and generated report files; serves them via
 * temporary signed URLs (never public objects).
 *
 * Not exercised by unit tests (needs live credentials); use
 * {@link InMemoryBlobStore} offline.
 */
export class OssBlobStore implements BlobStore {
  private readonly client: OSS;

  constructor(env: Env = getEnv()) {
    if (!isOssConfigured(env)) {
      throw new Error('OSS no está configurado. Define las variables OSS_*.');
    }
    this.client = new OSS({
      region: env.OSS_REGION!,
      bucket: env.OSS_BUCKET!,
      accessKeyId: env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET!,
    });
  }

  async put(
    key: string,
    data: Uint8Array | string,
    opts: { contentType?: string } = {},
  ): Promise<PutBlobResult> {
    const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    const options = opts.contentType
      ? { mime: opts.contentType, headers: { 'Content-Type': opts.contentType } }
      : undefined;
    await this.client.put(key, buf, options);
    return { key };
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const res = await this.client.get(key);
      const content = res.content as Buffer | undefined;
      return content ? new Uint8Array(content) : undefined;
    } catch (err) {
      if ((err as { code?: string }).code === 'NoSuchKey') return undefined;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.head(key);
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === 'NoSuchKey') return false;
      throw err;
    }
  }

  /** Time-limited signed URL (default 1h) for serving reports/uploads. */
  async getSignedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    return this.client.signatureUrl(key, { expires: expiresSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(key);
  }
}
