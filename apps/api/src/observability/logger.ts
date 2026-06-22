import { pino, stdSerializers, type Logger } from 'pino';
import { getEnv, type Env } from '../config/env.js';

/** Effective level: explicit LOG_LEVEL wins; otherwise silent in tests, info in
 *  production, debug in development. */
function resolveLevel(env: Env): Env['LOG_LEVEL'] & string {
  if (env.LOG_LEVEL) return env.LOG_LEVEL;
  if (env.NODE_ENV === 'test') return 'silent';
  return env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Process-wide structured logger.
 *
 * Redaction is a safety net layered on top of the discipline that secrets and
 * credentials are never placed into log payloads or the ledger: even if a header
 * or config object slips through, these paths are censored. Per-request child
 * loggers (see {@link ./http-logger}) inherit this configuration.
 */
export const logger: Logger = pino({
  level: resolveLevel(getEnv()),
  base: { service: 'agentops-api' },
  serializers: { err: stdSerializers.err },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'authorization',
      'cookie',
      '*.apiKey',
      '*.apikey',
      '*.token',
      '*.password',
      '*.secret',
      '*.accessKeyId',
      '*.accessKeySecret',
      'DASHSCOPE_API_KEY',
      'OEFA_API_KEY',
      'TABLESTORE_ACCESS_KEY_SECRET',
      'OSS_ACCESS_KEY_SECRET',
    ],
    censor: '[REDACTED]',
  },
});

export type { Logger };
