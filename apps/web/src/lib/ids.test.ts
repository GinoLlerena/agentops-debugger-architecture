import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSessionId } from './ids.js';

const UUID_RE = /^s-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newSessionId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('produces a full v4 UUID session id', () => {
    expect(newSessionId()).toMatch(UUID_RE);
    expect(newSessionId()).not.toBe(newSessionId());
  });

  it('works without crypto.randomUUID (insecure context, e.g. plain-http demo deploy)', () => {
    // crypto.randomUUID exists only in secure contexts; getRandomValues always does.
    const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', {
      getRandomValues: (b: Uint8Array) => realGetRandomValues(b),
    });
    expect(newSessionId()).toMatch(UUID_RE);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});
