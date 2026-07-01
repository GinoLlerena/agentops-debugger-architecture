import { currentRunObserver, type LlmCallObservation } from './run-context.js';

/** Approximate result size for the trace: array length, else JSON length, else 0.
 *  Records "how much came back" without copying the payload into the ledger. */
function resultSize(value: unknown): number {
  try {
    if (value == null) return 0;
    if (Array.isArray(value)) return value.length;
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Wrap selected async methods of a service so each **top-level** call is recorded
 * as a `tool_called` observation on the active run. The original method is invoked
 * on the raw target, so a method that calls a sibling internally (e.g.
 * `getCompanyProfile` → `getRecords`) is recorded once — the outer call — not
 * twice. Non-observed members are bound to the target and otherwise untouched, so
 * the proxied instance behaves identically for REST routes and startup indexing.
 * Outside a run context (no observer) every call is a pure pass-through.
 *
 * This is the single chokepoint that covers BOTH modes: live agents reach these
 * services through Mastra tools, offline agents call them directly.
 */
export function instrumentService<T extends object>(
  target: T,
  label: string,
  methods: Array<keyof T>,
): T {
  const observed = new Set<string | symbol>(methods as Array<string | symbol>);
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      const original = value as (...args: unknown[]) => unknown;
      if (!observed.has(prop)) return original.bind(obj);

      const tool = `${label}.${String(prop)}`;
      return (...args: unknown[]) => {
        const observer = currentRunObserver();
        if (!observer) return original.apply(obj, args);
        const start = Date.now();
        const record = (ok: boolean, out?: unknown) =>
          observer.recordToolCall({
            tool,
            params: args[0],
            durationMs: Date.now() - start,
            resultSize: ok ? resultSize(out) : 0,
            ok,
          });
        let result: unknown;
        try {
          result = original.apply(obj, args);
        } catch (err) {
          record(false);
          throw err;
        }
        if (result instanceof Promise) {
          return result.then(
            (out) => {
              record(true, out);
              return out;
            },
            (err) => {
              record(false);
              throw err;
            },
          );
        }
        record(true, result);
        return result;
      };
    },
  });
}

/**
 * Record one LLM generation against the active run. `usage` is read defensively:
 * the AI SDK / Mastra surface tokens as `inputTokens`/`outputTokens` (v5) and some
 * paths still use `promptTokens`/`completionTokens`. A no-op outside a run.
 */
export function recordLlmCall(
  role: LlmCallObservation['role'],
  durationMs: number,
  ok: boolean,
  opts: { model?: string; usage?: unknown } = {},
): void {
  const observer = currentRunObserver();
  if (!observer) return;
  const u = (opts.usage ?? {}) as {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  observer.recordLlmCall({
    role,
    model: opts.model,
    inputTokens: u.inputTokens ?? u.promptTokens,
    outputTokens: u.outputTokens ?? u.completionTokens,
    totalTokens: u.totalTokens,
    durationMs,
    ok,
  });
}
