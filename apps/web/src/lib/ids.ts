/** A short, URL-friendly session id for a fresh investigation. */
export function newSessionId(): string {
  const rand = crypto.randomUUID().split('-')[0];
  return `s-${rand}`;
}
