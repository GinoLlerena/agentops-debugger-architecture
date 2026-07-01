import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from './rate-limit.js';

function appWith(perMinute: number): Hono {
  const app = new Hono();
  app.use('*', rateLimit(perMinute));
  app.get('/x', (c) => c.text('ok'));
  return app;
}

const hit = (app: Hono, ip?: string) =>
  app.request('/x', ip ? { headers: { 'x-forwarded-for': ip } } : {});

describe('rateLimit', () => {
  it('limits per IP and isolates distinct X-Forwarded-For clients', async () => {
    const app = appWith(1);
    expect((await hit(app, '1.1.1.1')).status).toBe(200);
    expect((await hit(app, '1.1.1.1')).status).toBe(429); // same IP exhausted
    expect((await hit(app, '2.2.2.2')).status).toBe(200); // different IP, own bucket
  });

  it('keys on the left-most X-Forwarded-For hop', async () => {
    const app = appWith(1);
    expect((await hit(app, '9.9.9.9, 10.0.0.1')).status).toBe(200);
    expect((await hit(app, '9.9.9.9, 10.0.0.1')).status).toBe(429);
  });

  it('allows up to capacity before throttling', async () => {
    const app = appWith(2);
    expect((await hit(app, '3.3.3.3')).status).toBe(200);
    expect((await hit(app, '3.3.3.3')).status).toBe(200);
    expect((await hit(app, '3.3.3.3')).status).toBe(429);
  });

  it('is disabled (pass-through) when perMinute <= 0', async () => {
    const app = appWith(0);
    for (let i = 0; i < 5; i++) {
      expect((await hit(app, '4.4.4.4')).status).toBe(200);
    }
  });
});
