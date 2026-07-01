import type {
  Actor,
  AgentManifestRegistry,
  ArtifactRecord,
  ClarificationRequest,
  DomainTaskPacket,
  DomainTaskResult,
  NormalizedUserRequest,
  OrchestratorState,
  Resumption,
  StreamEvent,
} from '@agentops/shared';
import type { Translator } from '../../services/translation/index.js';

export type { Resumption };

/** Streamed progress sink — the same typed envelope powers live UI + the trace. */
export type OnProgress = (event: StreamEvent) => void | Promise<void>;

/** The Coordinator's planning outcome. */
export type PlanResult =
  | { kind: 'plan'; reasoning: string; tasks: DomainTaskPacket[] }
  | { kind: 'clarification'; clarification: ClarificationRequest }
  | { kind: 'reply'; text: string };

/** Planner = the Coordinator agent (classifies intent → typed tasks). */
export interface Planner {
  plan(input: {
    request: NormalizedUserRequest;
    state: OrchestratorState;
  }): Promise<PlanResult>;
}

/** Context handed to a specialist agent for one task. */
export interface AgentRunContext {
  /** Read-only snapshot of orchestrator state. */
  readonly state: OrchestratorState;
  /** Artifacts accumulated so far (evidence, record sets, chart data). */
  readonly artifacts: Record<string, ArtifactRecord>;
  /** Emit tool-call / progress events for the live trace. */
  readonly onProgress: OnProgress;
}

/** A specialist agent (Data/Docs/Report/ReportManager). */
export interface SpecialistAgent {
  readonly agentId: string;
  run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult>;
}

export type AgentMap = Record<string, SpecialistAgent>;

export interface CoordinatorDeps {
  planner: Planner;
  agents: AgentMap;
  registry?: AgentManifestRegistry;
  /** Runaway-loop backstop (architecture §5.2). Default 12. */
  maxTaskSteps?: number;
  /** Outbound citation localization at the response edge. Default: no-op (offline). */
  translator?: Translator;
  /** Injectable for deterministic tests. */
  clock?: () => Date;
  idgen?: () => string;
}

export interface RunOptions {
  onProgress?: OnProgress;
  /** Originator captured at the HTTP boundary (ip now; id/role once auth lands).
   *  Stamped onto every ledger event of the run for attribution. */
  actor?: Actor;
}

export interface Coordinator {
  /** Start a fresh turn (creates or extends session state). */
  start(request: NormalizedUserRequest, options?: RunOptions): Promise<OrchestratorState>;
  /** Resume a suspended run (approval/clarification). */
  resume(
    state: OrchestratorState,
    resumption: Resumption,
    options?: RunOptions,
  ): Promise<OrchestratorState>;
}
