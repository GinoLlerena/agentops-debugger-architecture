import { z } from 'zod';

/**
 * Typed environment configuration.
 *
 * Design rules:
 * - Parsing is **lazy and non-throwing at import time** so the module graph
 *   loads (and offline tests run) with no env set. Secrets are all `.optional()`.
 * - `getEnv()` accepts an injectable source for hermetic tests; with the default
 *   `process.env` it memoizes.
 * - Feature flags (`isQwenConfigured()` etc.) let services degrade gracefully
 *   instead of crashing when a credential is absent (FR-14 posture).
 *
 * `.env` loading (dotenv) happens only at the server entrypoint, never here, so
 * importing this module never reads the filesystem.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // --- Qwen Cloud / DashScope (OpenAI-compatible) ---
  DASHSCOPE_API_KEY: z.string().min(1).optional(),
  DASHSCOPE_BASE_URL: z
    .string()
    .url()
    .default('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  QWEN_MODEL: z.string().min(1).default('qwen-plus'),
  QWEN_PLANNER_MODEL: z.string().min(1).optional(),
  QWEN_EMBEDDING_MODEL: z.string().min(1).optional(),

  // --- OEFA Datos Abiertos (Junar) ---
  OEFA_API_KEY: z.string().min(1).optional(),
  OEFA_API_BASE_URL: z.string().url().default('http://api.datosabiertos.oefa.gob.pe/api/v2'),

  // --- Alibaba Cloud Tablestore ---
  TABLESTORE_ENDPOINT: z.string().min(1).optional(),
  TABLESTORE_INSTANCE: z.string().min(1).optional(),
  TABLESTORE_ACCESS_KEY_ID: z.string().min(1).optional(),
  TABLESTORE_ACCESS_KEY_SECRET: z.string().min(1).optional(),

  // --- Alibaba Cloud OSS ---
  OSS_REGION: z.string().min(1).optional(),
  OSS_BUCKET: z.string().min(1).optional(),
  OSS_ACCESS_KEY_ID: z.string().min(1).optional(),
  OSS_ACCESS_KEY_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let memoized: Env | undefined;

/**
 * Parse and return the environment. Treats empty strings as "unset" so a blank
 * `.env` placeholder doesn't read as a configured secret. Throws only if a
 * provided value is the wrong *shape* (e.g. a non-URL base URL).
 */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (source === process.env && memoized) return memoized;

  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    // Treat blank/whitespace-only values as unset, so a blank .env placeholder
    // never reads as a configured secret (would otherwise build a client with a
    // junk credential instead of degrading gracefully).
    cleaned[k] = v == null || v.trim() === '' ? undefined : v;
  }

  const parsed = EnvSchema.parse(cleaned);
  if (source === process.env) memoized = parsed;
  return parsed;
}

/** Reset memoization — test-only helper. */
export function resetEnvCache(): void {
  memoized = undefined;
}

export function isQwenConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.DASHSCOPE_API_KEY);
}

export function isOefaConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.OEFA_API_KEY);
}

export function isTablestoreConfigured(env: Env = getEnv()): boolean {
  return Boolean(
    env.TABLESTORE_ENDPOINT &&
      env.TABLESTORE_INSTANCE &&
      env.TABLESTORE_ACCESS_KEY_ID &&
      env.TABLESTORE_ACCESS_KEY_SECRET,
  );
}

export function isOssConfigured(env: Env = getEnv()): boolean {
  return Boolean(
    env.OSS_REGION && env.OSS_BUCKET && env.OSS_ACCESS_KEY_ID && env.OSS_ACCESS_KEY_SECRET,
  );
}
