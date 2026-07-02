/** A URL-friendly, unguessable session id for a fresh investigation. Uses a full
 *  UUID (not a truncated prefix) so a session id can't be enumerated/guessed —
 *  sessions are the only access boundary until real auth lands. */
export function newSessionId(): string {
  return `s-${uuid()}`;
}

/** `crypto.randomUUID` exists only in SECURE contexts (https / localhost) — on a
 *  plain-http deploy (e.g. the demo instance by IP) it is undefined and "New
 *  investigation" would throw. `getRandomValues` has no such restriction, so
 *  fall back to assembling an RFC 4122 v4 UUID from it (same entropy). */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
