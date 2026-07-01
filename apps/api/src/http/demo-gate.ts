import { timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';

/** httpOnly cookie carrying the demo token once a visitor has unlocked. */
const COOKIE = 'demo_token';
/** Demo unlock window before the visitor must re-open the link. */
const MAX_AGE_SECONDS = 60 * 60 * 12;

/** Constant-time token comparison; length mismatch short-circuits to false. */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when the request arrived over HTTPS (directly or via a TLS-terminating
 *  proxy), so the cookie can be marked `Secure` in production without breaking a
 *  plain-HTTP local run. */
function isHttps(c: Context): boolean {
  if (c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https') return true;
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Gate the API surface behind a shared demo token. When `token` is unset the
 * middleware is a pass-through (offline/dev stay fully open). When set, a request
 * must carry a matching `demo_token` cookie — obtained by opening
 * `/unlock?token=…` once. Apply this ONLY to API route prefixes; `/health`, the
 * static assets and the SPA fallback are intentionally left open so the unlock
 * page itself loads and health checks keep working.
 */
export function demoGate(token: string | undefined): MiddlewareHandler {
  if (!token) {
    return async (_c, next) => {
      await next();
    };
  }
  return async (c, next) => {
    const supplied = getCookie(c, COOKIE);
    if (supplied && tokensMatch(supplied, token)) {
      await next();
      return;
    }
    return c.json(
      { error: 'Acceso restringido. Abre el enlace con el token de demostración.' },
      401,
    );
  };
}

/**
 * `GET /unlock?token=…` — on a correct token, set the httpOnly demo cookie and
 * redirect to the app root; otherwise 403. A redirect to `/` when the gate is
 * disabled, so the link is harmless in offline/dev. Always left ungated.
 */
export function unlockHandler(token: string | undefined) {
  return (c: Context): Response => {
    if (!token) return c.redirect('/');
    const supplied = c.req.query('token') ?? '';
    if (!tokensMatch(supplied, token)) {
      return c.json({ error: 'Token de demostración inválido.' }, 403);
    }
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: isHttps(c),
      maxAge: MAX_AGE_SECONDS,
    });
    return c.redirect('/');
  };
}
