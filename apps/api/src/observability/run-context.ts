import { AsyncLocalStorage } from 'node:async_hooks';

/** A single tool/service invocation observed during a coordinator run. */
export interface ToolCallObservation {
  /** Stable tool name, e.g. `oefa.getCompanyProfile` or `rag.retrieve`. */
  tool: string;
  /** The primary argument (a filter/query) — never a secret. */
  params: unknown;
  durationMs: number;
  /** Rough size of the result (array length or JSON length). */
  resultSize: number;
  ok: boolean;
}

/** A single LLM generation observed during a run (live mode only). */
export interface LlmCallObservation {
  role: 'planner' | 'chat';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
  ok: boolean;
}

/**
 * Per-run sink the Coordinator installs around a run; instrumentation (service
 * proxies, agent wrappers) reports into it. Kept separate from the framework-
 * agnostic coordinator types so the instrumentation layer doesn't depend on the
 * coordinator and vice-versa.
 */
export interface RunObserver {
  recordToolCall(obs: ToolCallObservation): void;
  recordLlmCall(obs: LlmCallObservation): void;
}

const storage = new AsyncLocalStorage<RunObserver>();

/** Run `fn` with `observer` as the ambient run observer. The context propagates
 *  across awaits started within `fn`, so tool/LLM calls deep in the async agent
 *  pipeline find it via {@link currentRunObserver}. */
export function withRunObserver<T>(observer: RunObserver, fn: () => T): T {
  return storage.run(observer, fn);
}

/** The observer for the in-flight run, or undefined outside a run (e.g. a REST
 *  read), where instrumentation must stay a no-op. */
export function currentRunObserver(): RunObserver | undefined {
  return storage.getStore();
}
