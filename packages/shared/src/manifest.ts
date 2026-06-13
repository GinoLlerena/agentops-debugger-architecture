import { z } from 'zod';
import { ApprovalPolicy, Domain, DomainOperation } from './common.js';

/**
 * AgentManifest — routing as data (architecture §5.3). The collaboration
 * topology is declared, not coded into graph edges. Adding an agent = register a
 * manifest + its Mastra agent; the workflow never changes.
 *
 * Routing rule: find m where
 *   m.ownsDomains.includes(task.domain) && m.supportedOperations.includes(task.operation)
 */
export const AgentManifest = z.object({
  agentId: z.string().min(1),
  displayName: z.string(), // Spanish UI name, e.g. "Agente de Datos OEFA"
  ownsDomains: z.array(Domain).min(1),
  supportedOperations: z.array(DomainOperation).min(1),
  toolNames: z.array(z.string()).default([]),
  /** Default policy for this agent's operations; per-task can override. */
  approvalPolicy: ApprovalPolicy.default('none'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;

export const AgentManifestRegistry = z.array(AgentManifest);
export type AgentManifestRegistry = z.infer<typeof AgentManifestRegistry>;
