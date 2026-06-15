import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { getEnv, type Env } from '../../config/env.js';
import type { Embedder } from './types.js';

/** Cosine similarity in [-1, 1]; 0 for a zero/length-mismatched vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Qwen Cloud embeddings (DashScope, OpenAI-compatible). Optional: when
 * `QWEN_EMBEDDING_MODEL` is not available in credits, the RagService runs on the
 * lexical path instead (decision D4). Not unit-tested (needs a key); compile- and
 * integration-verified.
 */
export class QwenEmbedder implements Embedder {
  readonly model: string;
  private readonly embeddingModel;

  constructor(env: Env = getEnv()) {
    if (!env.DASHSCOPE_API_KEY) {
      throw new Error('Qwen no configurado: define DASHSCOPE_API_KEY para usar embeddings.');
    }
    if (!env.QWEN_EMBEDDING_MODEL) {
      throw new Error('Define QWEN_EMBEDDING_MODEL o usa el índice léxico (sin embeddings).');
    }
    const provider = createOpenAI({
      apiKey: env.DASHSCOPE_API_KEY,
      baseURL: env.DASHSCOPE_BASE_URL,
      compatibility: 'compatible',
    });
    this.model = env.QWEN_EMBEDDING_MODEL;
    this.embeddingModel = provider.embedding(this.model);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({ model: this.embeddingModel, values: texts });
    return embeddings;
  }
}

/** Build a Qwen embedder if configured, else `undefined` (lexical fallback). */
export function maybeCreateEmbedder(env: Env = getEnv()): Embedder | undefined {
  if (!env.DASHSCOPE_API_KEY || !env.QWEN_EMBEDDING_MODEL) return undefined;
  return new QwenEmbedder(env);
}
