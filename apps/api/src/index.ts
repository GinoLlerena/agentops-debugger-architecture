/**
 * apps/api — backend entrypoint.
 * Phase 1 wires the service layer (Qwen, OEFA, storage, RAG). Phases 2–3 add the
 * Mastra Coordinator workflow, agents, and the REST + streaming `/agent/*`
 * endpoints. `.env` is loaded here (the server entry), never inside modules.
 */
import 'dotenv/config';
import { STREAM_EVENT_TYPES } from '@agentops/shared';
import {
  getEnv,
  isOefaConfigured,
  isOssConfigured,
  isQwenConfigured,
  isTablestoreConfigured,
} from './config/env.js';

export function describeApi(): string {
  const env = getEnv();
  const flags = [
    `qwen=${isQwenConfigured(env)}`,
    `oefa=${isOefaConfigured(env)}`,
    `tablestore=${isTablestoreConfigured(env)}`,
    `oss=${isOssConfigured(env)}`,
  ].join(' ');
  return `AgentOps Debugger API — eventos: ${STREAM_EVENT_TYPES.join(', ')} · config: ${flags}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(describeApi());
}
