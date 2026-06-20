/**
 * Orchestration layer (Phase 2). The Coordinator engine is framework-agnostic and
 * dependency-injected (fully testable with mocked agents); the specialist agents
 * and planner are real Mastra Agents (built on the AI SDK v5 → Qwen Cloud)
 * wrapping the Phase 1 tool descriptors.
 */
export * from './manifests/registry.js';
export * from './coordinator/types.js';
export { createCoordinator } from './coordinator/coordinator.js';
export { applyEvidenceGuardrail, collectKnownEvidenceIds } from './coordinator/guardrail.js';

// Mastra agent adapters (need a live Qwen model at runtime).
export { toMastraTool, toMastraTools } from './agents/mastra-tool.js';
export {
  toSpecialistAgent,
  toLiveDataAgent,
  createSpecialistAgents,
  createDataMastraAgent,
  createDocsMastraAgent,
} from './agents/specialists.js';
export { createQwenPlanner } from './agents/planner.js';
