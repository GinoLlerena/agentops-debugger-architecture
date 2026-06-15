import { describe, expect, it } from 'vitest';
import { getEnv } from '../../config/env.js';
import { createQwenProvider } from './qwen-provider.js';

/**
 * Offline tests: validate config + model wiring without any network call.
 * `provider(modelId)` only constructs a model handle; it does not hit the API,
 * so we can assert the resolved model ids and base URL deterministically.
 * The live round-trip (`qwenSmokeTest`) is key-gated and not exercised here.
 */
describe('qwen provider', () => {
  it('throws a clear error when DASHSCOPE_API_KEY is missing', () => {
    expect(() => createQwenProvider(getEnv({}))).toThrow(/DASHSCOPE_API_KEY/);
  });

  it('wires the default chat model and falls back to it for the planner', () => {
    const qwen = createQwenProvider(getEnv({ DASHSCOPE_API_KEY: 'sk-test' }));
    expect(qwen.chatModelId).toBe('qwen-plus');
    expect(qwen.plannerModelId).toBe('qwen-plus');
    expect(qwen.baseURL).toContain('dashscope');
    expect(qwen.getChatModel().modelId).toBe('qwen-plus');
  });

  it('uses a distinct planner model when QWEN_PLANNER_MODEL is set', () => {
    const qwen = createQwenProvider(
      getEnv({
        DASHSCOPE_API_KEY: 'sk-test',
        QWEN_MODEL: 'qwen-plus',
        QWEN_PLANNER_MODEL: 'qwen-max',
      }),
    );
    expect(qwen.chatModelId).toBe('qwen-plus');
    expect(qwen.plannerModelId).toBe('qwen-max');
    expect(qwen.getPlannerModel().modelId).toBe('qwen-max');
    expect(qwen.getModel('chat').modelId).toBe('qwen-plus');
    expect(qwen.getModel('planner').modelId).toBe('qwen-max');
  });
});
