import type { MiddlewareHandler } from 'hono';
import { logger, type Logger } from './logger.js';

/** Context variables added by the observability middleware (and hono/request-id,
 *  which sets `requestId`). Apply as `new Hono<{ Variables: ObsVariables }>()`. */
export interface ObsVariables {
  requestId: string;
  log: Logger;
}

/**
 * Per-request correlation + access logging. Pairs with `hono/request-id` (which
 * sets/propagates `X-Request-Id`): binds a child logger carrying that id to the
 * context as `log`, and logs one access line per request with method, path,
 * status and duration. Downstream errors are logged by `app.onError`, which reads
 * the same correlation id off the context.
 */
export function httpLogger(): MiddlewareHandler<{ Variables: ObsVariables }> {
  return async (c, next) => {
    const log = logger.child({ requestId: c.get('requestId') ?? 'unknown' });
    c.set('log', log);
    const start = Date.now();
    try {
      await next();
    } finally {
      log.info(
        { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start },
        'request',
      );
    }
  };
}
