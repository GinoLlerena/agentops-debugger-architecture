import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { unlockHandler } from './demo-gate.js';

describe('demo gate — unlock cookie', () => {
  it('marks the cookie Secure over https (x-forwarded-proto) but not over http', async () => {
    const app = new Hono();
    app.get('/unlock', unlockHandler('sek'));

    const https = await app.request('/unlock?token=sek', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(https.status).toBe(302);
    expect((https.headers.get('set-cookie') ?? '').toLowerCase()).toContain('secure');

    const http = await app.request('/unlock?token=sek');
    expect(http.status).toBe(302);
    expect((http.headers.get('set-cookie') ?? '').toLowerCase()).not.toContain('secure');
  });

  it('rejects a wrong token with 403 and short-circuits to a redirect when disabled', async () => {
    const gated = new Hono();
    gated.get('/unlock', unlockHandler('sek'));
    expect((await gated.request('/unlock?token=nope')).status).toBe(403);

    const open = new Hono();
    open.get('/unlock', unlockHandler(undefined));
    expect((await open.request('/unlock')).status).toBe(302);
  });
});
