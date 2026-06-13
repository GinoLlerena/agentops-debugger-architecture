/**
 * apps/api — backend entrypoint (placeholder for Phase 0).
 * Phases 1–3 add: Qwen provider, OEFA/RAG/storage services, the Mastra
 * Coordinator workflow, and the REST + streaming `/agent/*` endpoints.
 *
 * This file imports a shared contract to prove the workspace wiring resolves.
 */
import { STREAM_EVENT_TYPES } from '@agentops/shared';

export function describeApi(): string {
  return `AgentOps Debugger API — stream events: ${STREAM_EVENT_TYPES.join(', ')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(describeApi());
}
