import {
  AgentManifest,
  type AgentManifestRegistry,
  type Domain,
  type DomainOperation,
} from '@agentops/shared';

/**
 * Manifest-driven routing (architecture §5.3) — the collaboration topology is
 * declared data, not graph edges. Adding an agent = registering a manifest + its
 * agent; the Coordinator workflow never changes. This is the heart of the
 * "Agent Society" story: task decomposition + role assignment is explicit and
 * inspectable.
 */

export const AGENT_IDS = {
  coordinator: 'coordinator',
  data: 'data-agent',
  docs: 'docs-agent',
  report: 'report-agent',
  reportManager: 'report-manager',
  verifier: 'verifier',
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

/** Operations that cause a side effect and therefore pass through the HITL gate. */
export const SIDE_EFFECTING_OPS: ReadonlySet<DomainOperation> = new Set([
  'create',
  'update',
  'delete',
]);

export const AGENT_MANIFESTS: AgentManifestRegistry = AgentManifest.array().parse([
  {
    agentId: AGENT_IDS.coordinator,
    displayName: 'Coordinador',
    ownsDomains: ['routing'],
    supportedOperations: ['plan'],
    toolNames: [],
    approvalPolicy: 'none',
  },
  {
    agentId: AGENT_IDS.data,
    displayName: 'Agente de Datos OEFA',
    ownsDomains: ['oefa_data'],
    supportedOperations: ['search', 'explain', 'verify'],
    toolNames: [
      'list_oefa_datasets',
      'fetch_oefa_dataset',
      'search_oefa_records',
      'get_company_oefa_profile',
    ],
    approvalPolicy: 'none',
  },
  {
    agentId: AGENT_IDS.docs,
    displayName: 'Agente de Documentos',
    ownsDomains: ['oefa_docs'],
    supportedOperations: ['search', 'explain'],
    toolNames: ['retrieve_oefa_context', 'index_oefa_document'],
    approvalPolicy: 'none',
  },
  {
    agentId: AGENT_IDS.report,
    displayName: 'Agente de Informes',
    ownsDomains: ['report'],
    supportedOperations: ['create'],
    toolNames: [],
    approvalPolicy: 'none', // drafting is not a side effect
  },
  {
    agentId: AGENT_IDS.reportManager,
    displayName: 'Gestor de Expedientes',
    ownsDomains: ['report_admin'],
    supportedOperations: ['create', 'search', 'update', 'delete'],
    toolNames: ['save_report', 'search_reports', 'open_session', 'archive_report'],
    approvalPolicy: 'required', // save/update/delete pass the HITL gate
  },
  {
    agentId: AGENT_IDS.verifier,
    displayName: 'Verificador',
    ownsDomains: ['eval'],
    supportedOperations: ['verify'],
    toolNames: ['run_eval_case'],
    approvalPolicy: 'none',
  },
]);

export class ManifestRoutingError extends Error {
  constructor(
    readonly domain: Domain,
    readonly operation: DomainOperation,
  ) {
    super(`No hay un agente que cubra ${domain}/${operation}.`);
    this.name = 'ManifestRoutingError';
  }
}

/**
 * Resolve the owning manifest for a `domain+operation` task. Throws a typed
 * {@link ManifestRoutingError} for an unknown pair (errors are data at the
 * boundary; the engine catches and records it).
 */
export function resolveManifestForTask(
  domain: Domain,
  operation: DomainOperation,
  registry: AgentManifestRegistry = AGENT_MANIFESTS,
): AgentManifest {
  const manifest = registry.find(
    (m) => m.ownsDomains.includes(domain) && m.supportedOperations.includes(operation),
  );
  if (!manifest) throw new ManifestRoutingError(domain, operation);
  return manifest;
}

/** Whether a routed task must pass the HITL approval gate before running. */
export function requiresApproval(
  operation: DomainOperation,
  manifest: AgentManifest,
  taskPolicy?: 'none' | 'required',
): boolean {
  if (taskPolicy === 'required') return true;
  if (taskPolicy === 'none') return false;
  return manifest.approvalPolicy === 'required' && SIDE_EFFECTING_OPS.has(operation);
}
