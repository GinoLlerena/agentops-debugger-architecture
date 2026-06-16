import type { DomainTaskResult, Finding, OrchestratorState } from '@agentops/shared';

/**
 * Evidence-first guardrail (FR-41, decision D8). Enforced at the orchestration
 * layer — not by trusting the LLM. A finding survives only if it cites at least
 * one piece of evidence that actually exists in the accumulated evidence set
 * (this result + prior results + artifacts). Findings with no citation, or that
 * cite unknown ids, are dropped and logged.
 */

/** All evidence ids known at the point a result is applied. */
export function collectKnownEvidenceIds(
  state: OrchestratorState,
  current: DomainTaskResult,
): Set<string> {
  const ids = new Set<string>();
  for (const e of current.evidence) ids.add(e.id);
  for (const task of state.completedTasks) for (const e of task.evidence) ids.add(e.id);
  for (const id of Object.keys(state.artifacts)) ids.add(id);
  return ids;
}

export interface GuardrailOutcome {
  kept: Finding[];
  dropped: Finding[];
}

export function applyEvidenceGuardrail(findings: Finding[], knownIds: Set<string>): GuardrailOutcome {
  const kept: Finding[] = [];
  const dropped: Finding[] = [];
  for (const f of findings) {
    const supported = f.evidenceIds.length > 0 && f.evidenceIds.some((id) => knownIds.has(id));
    (supported ? kept : dropped).push(f);
  }
  return { kept, dropped };
}
