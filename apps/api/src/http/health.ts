import { generateText } from 'ai';
import {
  isOefaConfigured,
  isOssConfigured,
  isQwenConfigured,
  isTablestoreConfigured,
} from '../config/env.js';
import { COLLECTIONS } from '../services/storage/index.js';
import { createQwenProvider } from '../services/qwen/qwen-provider.js';
import { logger } from '../observability/logger.js';
import type { AppDeps } from './deps.js';

type ServiceStatus = 'ok' | 'error' | 'skipped';

interface ServiceHealth {
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
}

export interface DeepHealth {
  status: 'ok' | 'degraded';
  mode: 'live' | 'offline';
  services: Record<'tablestore' | 'oss' | 'oefa' | 'qwen', ServiceHealth>;
}

/** Time a liveness probe; never throws. On failure the real error is logged
 *  server-side and the client gets only a coarse `error` status (this endpoint is
 *  unauthenticated, so it must not leak driver/credential detail). */
async function probe(service: string, fn: () => Promise<void>): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    logger.warn({ err, service }, 'deep health check failed');
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

const SKIPPED: ServiceHealth = { status: 'skipped' };

/**
 * Actively ping each *configured* integration so a deploy can be verified (and
 * degradation observed) without waiting for the first user request. Unconfigured
 * integrations report `skipped`; a single failure degrades the summary but the
 * endpoint still returns 200 with per-service detail.
 *
 * The Qwen check is config-only by default (no paid model call) so repeated
 * health polling can't burn credits; pass `opts.llm` to make one real generation.
 */
export async function deepHealth(deps: AppDeps, opts: { llm?: boolean } = {}): Promise<DeepHealth> {
  const env = deps.env;

  const [tablestore, oss, oefa, qwen] = await Promise.all([
    isTablestoreConfigured(env)
      ? probe('tablestore', async () => {
          await deps.stores.documents.list(COLLECTIONS.sessions, { limit: 1 });
        })
      : Promise.resolve(SKIPPED),
    isOssConfigured(env)
      ? probe('oss', async () => {
          await deps.stores.blobs.exists('__health_probe__');
        })
      : Promise.resolve(SKIPPED),
    isOefaConfigured(env)
      ? probe('oefa', async () => {
          await deps.oefa.getRecords(undefined, { maxRows: 1 });
        })
      : Promise.resolve(SKIPPED),
    qwenHealth(env, opts.llm ?? false),
  ]);

  const services = { tablestore, oss, oefa, qwen };
  const status = Object.values(services).some((s) => s.status === 'error') ? 'degraded' : 'ok';
  return { status, mode: deps.mode, services };
}

async function qwenHealth(
  env: AppDeps['env'],
  llm: boolean,
): Promise<ServiceHealth> {
  if (!isQwenConfigured(env)) return SKIPPED;
  if (!llm) return { status: 'ok', detail: 'configurado (sin llamada al modelo; usa ?llm=1)' };
  return probe('qwen', async () => {
    const qwen = createQwenProvider(env);
    await generateText({ model: qwen.getChatModel(), prompt: 'ping', maxOutputTokens: 1 });
  });
}
