import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';
import { getEnv, isQwenConfigured, type Env } from '../../config/env.js';

/**
 * Qwen Cloud (DashScope) model provider — the core model integration and one of
 * the **Alibaba/Qwen-usage proof files** for the hackathon.
 *
 * DashScope exposes an OpenAI-compatible surface, so we configure the AI SDK's
 * OpenAI provider with the DashScope base URL. Mastra (Phase 2) consumes AI-SDK
 * `LanguageModel` instances directly, so `getChatModel()`/`getPlannerModel()`
 * are exactly what the agents/workflow will wire in.
 *
 * Model roles:
 * - **chat model** (`QWEN_MODEL`, default `qwen-plus`): specialist agents.
 * - **planner model** (`QWEN_PLANNER_MODEL` if set, else the chat model): the
 *   Coordinator benefits from a stronger reasoning model when available.
 */

export type QwenRole = 'chat' | 'planner';

export interface QwenProvider {
  readonly baseURL: string;
  readonly chatModelId: string;
  readonly plannerModelId: string;
  /** AI-SDK model handle for specialist agents. */
  getChatModel(): LanguageModel;
  /** AI-SDK model handle for the Coordinator/planner. */
  getPlannerModel(): LanguageModel;
  getModel(role: QwenRole): LanguageModel;
}

/**
 * Build a Qwen provider from env. Throws a clear, actionable error if the API
 * key is missing — call only when a model is actually needed (services that can
 * degrade should check {@link isQwenConfigured} first).
 */
export function createQwenProvider(env: Env = getEnv()): QwenProvider {
  if (!isQwenConfigured(env)) {
    throw new Error(
      'Qwen Cloud no está configurado: define DASHSCOPE_API_KEY (y opcionalmente ' +
        'DASHSCOPE_BASE_URL / QWEN_MODEL / QWEN_PLANNER_MODEL). Ver .env.example.',
    );
  }

  // DashScope is OpenAI-compatible; point the OpenAI provider at its base URL.
  const provider: OpenAIProvider = createOpenAI({
    apiKey: env.DASHSCOPE_API_KEY,
    baseURL: env.DASHSCOPE_BASE_URL,
  });

  const chatModelId = env.QWEN_MODEL;
  const plannerModelId = env.QWEN_PLANNER_MODEL ?? env.QWEN_MODEL;

  return {
    baseURL: env.DASHSCOPE_BASE_URL,
    chatModelId,
    plannerModelId,
    getChatModel: () => provider(chatModelId),
    getPlannerModel: () => provider(plannerModelId),
    getModel: (role) => provider(role === 'planner' ? plannerModelId : chatModelId),
  };
}

/**
 * Live smoke test (FR core): round-trips one completion through Qwen Cloud.
 * Requires a real key + network, so it is NOT run in unit tests — call it from a
 * script or a key-gated integration test. Returns the model's text reply.
 */
export async function qwenSmokeTest(
  prompt = 'Responde con una sola palabra: "operativo".',
  env: Env = getEnv(),
): Promise<string> {
  const qwen = createQwenProvider(env);
  const { text } = await generateText({
    model: qwen.getChatModel(),
    prompt,
    maxOutputTokens: 32,
  });
  return text.trim();
}
