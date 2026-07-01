import { describe, expect, it } from 'vitest';
import {
  AGENT_IDS,
  AGENT_MANIFESTS,
  ManifestRoutingError,
  requiresApproval,
  resolveManifestForTask,
} from './registry.js';

describe('resolveManifestForTask', () => {
  it('routes each domain+operation to the owning agent', () => {
    expect(resolveManifestForTask('oefa_data', 'search').agentId).toBe(AGENT_IDS.data);
    expect(resolveManifestForTask('oefa_docs', 'explain').agentId).toBe(AGENT_IDS.docs);
    expect(resolveManifestForTask('report', 'create').agentId).toBe(AGENT_IDS.report);
    expect(resolveManifestForTask('report_admin', 'create').agentId).toBe(AGENT_IDS.reportManager);
    expect(resolveManifestForTask('routing', 'plan').agentId).toBe(AGENT_IDS.coordinator);
  });

  it('throws a typed error for an unknown domain+operation pair', () => {
    expect(() => resolveManifestForTask('oefa_data', 'create')).toThrow(ManifestRoutingError);
    expect(() => resolveManifestForTask('oefa_docs', 'delete')).toThrow(ManifestRoutingError);
  });

  it('every manifest is internally consistent (no duplicate agentIds)', () => {
    const ids = AGENT_MANIFESTS.map((m) => m.agentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('requiresApproval', () => {
  const reportManager = resolveManifestForTask('report_admin', 'create');
  const dataAgent = resolveManifestForTask('oefa_data', 'search');

  it('requires approval for side-effecting ops on a required-policy agent', () => {
    expect(requiresApproval('create', reportManager)).toBe(true);
    expect(requiresApproval('delete', reportManager)).toBe(true);
  });

  it('does not require approval for read ops even on a required-policy agent', () => {
    expect(requiresApproval('search', reportManager)).toBe(false);
  });

  it('never requires approval for a none-policy agent', () => {
    expect(requiresApproval('create', dataAgent)).toBe(false);
  });

  it('a per-task policy can escalate to required', () => {
    expect(requiresApproval('search', reportManager, 'required')).toBe(true);
  });

  it("a per-task 'none' (LLM-authored in live mode) cannot waive the manifest gate", () => {
    expect(requiresApproval('create', reportManager, 'none')).toBe(true);
    expect(requiresApproval('delete', reportManager, 'none')).toBe(true);
    // still no gate where the manifest never required one
    expect(requiresApproval('create', dataAgent, 'none')).toBe(false);
  });
});
