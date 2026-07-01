import { describe, expect, it } from 'vitest';
import type { DestinationStream } from 'pino';
import { createLogger } from './logger.js';

describe('logger redaction', () => {
  it('censors secret-bearing paths and never emits the raw values', () => {
    const lines: string[] = [];
    const stream: DestinationStream = {
      write: (s) => {
        lines.push(s);
      },
    };
    const log = createLogger({ level: 'info', destination: stream });

    log.info(
      {
        authorization: 'Bearer super-secret-token',
        DASHSCOPE_API_KEY: 'sk-live-123',
        creds: { token: 'tok-xyz', password: 'pw-abc', accessKeySecret: 'aks-789' },
      },
      'msg',
    );

    const out = lines.join('');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('Bearer super-secret-token');
    expect(out).not.toContain('sk-live-123');
    expect(out).not.toContain('tok-xyz');
    expect(out).not.toContain('pw-abc');
    expect(out).not.toContain('aks-789');
  });
});
