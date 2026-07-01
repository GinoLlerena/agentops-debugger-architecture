import { describe, expect, it } from 'vitest';
import { instrumentService } from './instrument.js';
import { withRunObserver, type RunObserver, type ToolCallObservation } from './run-context.js';

class Svc {
  async ok(x: number): Promise<number[]> {
    return [x, x];
  }
  async boom(): Promise<never> {
    throw new Error('nope');
  }
  // Calls a sibling via `this`; instrumentation must not double-count it.
  async outer(): Promise<string> {
    return this.inner();
  }
  async inner(): Promise<string> {
    return 'inner';
  }
}

function collector(): { obs: RunObserver; tools: ToolCallObservation[] } {
  const tools: ToolCallObservation[] = [];
  return {
    obs: { recordToolCall: (o) => tools.push(o), recordLlmCall: () => {} },
    tools,
  };
}

describe('instrumentService', () => {
  it('records a successful call with result size and ok:true', async () => {
    const svc = instrumentService(new Svc(), 'svc', ['ok']);
    const { obs, tools } = collector();
    const out = await withRunObserver(obs, () => svc.ok(2));
    expect(out).toEqual([2, 2]);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ tool: 'svc.ok', resultSize: 2, ok: true });
    expect(typeof tools[0]!.durationMs).toBe('number');
  });

  it('records ok:false and rethrows on error', async () => {
    const svc = instrumentService(new Svc(), 'svc', ['boom']);
    const { obs, tools } = collector();
    await expect(withRunObserver(obs, () => svc.boom())).rejects.toThrow('nope');
    expect(tools).toEqual([expect.objectContaining({ tool: 'svc.boom', ok: false, resultSize: 0 })]);
  });

  it('records a top-level call once — an internal sibling call is not double-counted', async () => {
    const svc = instrumentService(new Svc(), 'svc', ['outer', 'inner']);
    const { obs, tools } = collector();
    await withRunObserver(obs, () => svc.outer());
    expect(tools.map((t) => t.tool)).toEqual(['svc.outer']);
  });

  it('is a pass-through outside a run context (no observer)', async () => {
    const svc = instrumentService(new Svc(), 'svc', ['ok']);
    await expect(svc.ok(5)).resolves.toEqual([5, 5]);
  });
});
