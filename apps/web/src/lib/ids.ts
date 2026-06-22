/** A URL-friendly, unguessable session id for a fresh investigation. Uses a full
 *  UUID (not a truncated prefix) so a session id can't be enumerated/guessed —
 *  sessions are the only access boundary until real auth lands. */
export function newSessionId(): string {
  return `s-${crypto.randomUUID()}`;
}
