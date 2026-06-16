import {
  type DomainTaskPacket,
  type DomainTaskResult,
  type EvidenceItem,
  type LedgerEvent,
  type LedgerEventType,
  type NormalizedUserRequest,
  type OrchestratorState,
  type UiAction,
} from '@agentops/shared';
import {
  AGENT_MANIFESTS,
  ManifestRoutingError,
  requiresApproval,
  resolveManifestForTask,
} from '../manifests/registry.js';
import { applyEvidenceGuardrail, collectKnownEvidenceIds } from './guardrail.js';
import type {
  Coordinator,
  CoordinatorDeps,
  OnProgress,
  PlanResult,
  Resumption,
  RunOptions,
} from './types.js';

const DEFAULT_MAX_TASK_STEPS = 12;
const APPROVED_KEY = 'approvedTaskIds';
const REQUEST_KEY = 'originalRequest';

const noop: OnProgress = () => {};

/**
 * The Coordinator orchestration engine: `ingest → plan → [route → run → apply]*
 * → finalize` with a bounded loop (architecture §4.2, §5.2). Dependency-injected
 * and framework-agnostic, so it is fully testable over a mocked planner + agent
 * map with no live LLM. Suspension uses our own snapshot model: when a run needs
 * HITL it sets `executionStatus: 'waiting'` and returns; the caller persists the
 * state and later calls {@link resume} (architecture §11.2).
 *
 * Replace-reducer discipline: a single state object is threaded through and fully
 * assembled before return (§11.3). Errors are data, never thrown across the
 * boundary (§12).
 */
export function createCoordinator(deps: CoordinatorDeps): Coordinator {
  const registry = deps.registry ?? AGENT_MANIFESTS;
  const maxTaskSteps = deps.maxTaskSteps ?? DEFAULT_MAX_TASK_STEPS;
  const clock = deps.clock ?? (() => new Date());
  let counter = 0;
  const idgen = deps.idgen ?? (() => `id-${++counter}`);

  // ── helpers ────────────────────────────────────────────────────────────────

  function ledger(
    state: OrchestratorState,
    type: LedgerEventType,
    payload: Record<string, unknown> = {},
    meta: { agentId?: string; taskId?: string } = {},
  ): void {
    const event: LedgerEvent = {
      seq: state.ledger.length,
      sessionId: state.sessionId,
      runId: state.runId,
      type,
      timestamp: clock().toISOString(),
      agentId: meta.agentId,
      taskId: meta.taskId,
      payload,
    };
    state.ledger.push(event);
  }

  const emit = async (onProgress: OnProgress, event: Parameters<OnProgress>[0]) => {
    await onProgress(event);
  };

  function approvedSet(state: OrchestratorState): Set<string> {
    const raw = state.workspace.sharedFacts[APPROVED_KEY];
    return new Set(Array.isArray(raw) ? (raw as string[]) : []);
  }

  function markApproved(state: OrchestratorState, taskId: string): void {
    const set = approvedSet(state);
    set.add(taskId);
    state.workspace.sharedFacts[APPROVED_KEY] = [...set];
  }

  function failedResult(task: DomainTaskPacket, code: string, message: string): DomainTaskResult {
    return {
      taskId: task.taskId,
      agentId: task.agentId ?? 'unknown',
      status: 'failed',
      summary: message,
      artifacts: [],
      findings: [],
      evidence: [],
      nextTasks: [],
      errors: [{ code, message, recoverable: false }],
      warnings: [],
    };
  }

  function collectAllEvidence(state: OrchestratorState): EvidenceItem[] {
    const byId = new Map<string, EvidenceItem>();
    for (const t of state.completedTasks) for (const e of t.evidence) byId.set(e.id, e);
    return [...byId.values()];
  }

  // ── steps ────────────────────────────────────────────────────────────────

  function ingest(request: NormalizedUserRequest): OrchestratorState {
    const runId = idgen();
    const sessionId = request.sessionId ?? idgen();
    const state: OrchestratorState = {
      runId,
      threadId: sessionId,
      sessionId,
      executionStatus: 'running',
      workspace: { domains: {}, sharedFacts: { [REQUEST_KEY]: request }, entityRefs: {} },
      conversation: { rollingSummary: '', turnSummaries: [], entityIndex: {}, decisionLog: [] },
      pendingTasks: [],
      completedTasks: [],
      artifacts: {},
      ledger: [],
    };
    ledger(state, 'turn_opened', { text: request.text });
    return state;
  }

  async function doPlan(
    state: OrchestratorState,
    request: NormalizedUserRequest,
    onProgress: OnProgress,
  ): Promise<OrchestratorState> {
    let result: PlanResult;
    try {
      result = await deps.planner.plan({ request, state });
    } catch (err) {
      state.executionStatus = 'failed';
      ledger(state, 'error', { code: 'planner_error', message: errMsg(err) });
      state.finalResponseDraft =
        'No se pudo planificar la consulta en este momento. Intenta nuevamente.';
      return finalize(state, onProgress);
    }

    if (result.kind === 'clarification') {
      state.executionStatus = 'waiting';
      state.interruptState = { interruptId: idgen(), reason: 'clarification' }; // no taskId → planner-origin
      ledger(state, 'clarification_required', { question: result.clarification.question });
      await emit(onProgress, { type: 'clarification_required', payload: result.clarification });
      return state;
    }
    if (result.kind === 'reply') {
      state.finalResponseDraft = result.text;
      return finalize(state, onProgress);
    }

    state.pendingTasks = [...result.tasks];
    ledger(state, 'plan_created', { reasoning: result.reasoning, taskCount: result.tasks.length });
    await emit(onProgress, {
      type: 'plan',
      payload: { reasoning: result.reasoning, tasks: result.tasks },
    });
    return drive(state, onProgress);
  }

  async function drive(state: OrchestratorState, onProgress: OnProgress): Promise<OrchestratorState> {
    let steps = 0;
    while (state.pendingTasks.length > 0 && state.executionStatus === 'running') {
      if (steps >= maxTaskSteps) {
        ledger(state, 'warning', {
          code: 'max_task_steps',
          message: `Se alcanzó el límite de ${maxTaskSteps} pasos; resultado parcial.`,
        });
        state.finalResponseDraft ??=
          'Se alcanzó el límite de pasos del agente. Se devuelve un resultado parcial.';
        break;
      }
      steps++;

      const task = state.pendingTasks[0]!;

      // route
      let agentId: string;
      let manifest;
      try {
        manifest = resolveManifestForTask(task.domain, task.operation, registry);
        agentId = manifest.agentId;
      } catch (err) {
        const code = err instanceof ManifestRoutingError ? 'routing_error' : 'route_error';
        state.completedTasks = [...state.completedTasks, failedResult(task, code, errMsg(err))];
        state.pendingTasks = state.pendingTasks.slice(1);
        ledger(state, 'error', { code, message: errMsg(err) }, { taskId: task.taskId });
        continue;
      }
      task.agentId = agentId;
      state.activeTask = task;
      ledger(
        state,
        'task_routed',
        { domain: task.domain, operation: task.operation },
        { taskId: task.taskId, agentId },
      );

      // approval gate (HITL) before a side-effecting task
      if (
        requiresApproval(task.operation, manifest, task.approvalPolicy) &&
        !approvedSet(state).has(task.taskId)
      ) {
        state.executionStatus = 'waiting';
        state.interruptState = { interruptId: idgen(), reason: 'approval', taskId: task.taskId };
        ledger(state, 'approval_required', {}, { taskId: task.taskId, agentId });
        await emit(onProgress, {
          type: 'approval_required',
          payload: { interruptId: state.interruptState.interruptId, description: task.title },
        });
        return state; // suspend
      }

      // run
      await emit(onProgress, {
        type: 'task_start',
        payload: { taskId: task.taskId, agentId, title: task.title },
      });
      const agent = deps.agents[agentId];
      let result: DomainTaskResult;
      if (!agent) {
        result = failedResult(task, 'agent_unavailable', `Agente ${agentId} no disponible.`);
      } else {
        try {
          result = await agent.run(task, {
            state,
            artifacts: state.artifacts,
            onProgress,
          });
        } catch (err) {
          result = failedResult(task, 'agent_error', errMsg(err));
        }
      }

      // apply (may suspend on clarification)
      const suspended = applyResult(state, task, result, onProgress);
      if (suspended) return state;
    }
    return finalize(state, onProgress);
  }

  /** Returns true if the run suspended (clarification) and the caller must stop. */
  function applyResult(
    state: OrchestratorState,
    task: DomainTaskPacket,
    result: DomainTaskResult,
    onProgress: OnProgress,
  ): boolean {
    // agent needs user input (e.g. ambiguous entity) → suspend, keep task at head
    if (result.status === 'needs_user_input' && result.clarification) {
      state.executionStatus = 'waiting';
      state.interruptState = { interruptId: idgen(), reason: 'clarification', taskId: task.taskId };
      ledger(state, 'clarification_required', {}, { taskId: task.taskId, agentId: result.agentId });
      void emit(onProgress, { type: 'clarification_required', payload: result.clarification });
      return true;
    }

    // evidence-first guardrail
    const knownIds = collectKnownEvidenceIds(state, result);
    const { kept, dropped } = applyEvidenceGuardrail(result.findings, knownIds);
    if (dropped.length > 0) {
      ledger(
        state,
        'guardrail_drop',
        { count: dropped.length, statements: dropped.map((d) => d.statement) },
        { taskId: task.taskId, agentId: result.agentId },
      );
    }
    // Stamp every evidence item with its producing agent so consumers (the canvas
    // tabs, the trace) can attribute it without relying on id-prefix conventions.
    const stampedEvidence = result.evidence.map((e) => ({
      ...e,
      producedByAgentId: e.producedByAgentId ?? result.agentId,
    }));
    const cleaned: DomainTaskResult = { ...result, findings: kept, evidence: stampedEvidence };

    // merge artifacts + evidence
    const artifacts = { ...state.artifacts };
    for (const a of result.artifacts) artifacts[a.id] = a;
    state.artifacts = artifacts;
    if (result.evidence.length > 0) {
      ledger(
        state,
        'evidence_attached',
        { count: result.evidence.length },
        { taskId: task.taskId, agentId: result.agentId },
      );
    }

    state.completedTasks = [...state.completedTasks, cleaned];
    // advance queue: drop head, enqueue any follow-on tasks (nextTasks-as-data)
    state.pendingTasks = [...state.pendingTasks.slice(1), ...result.nextTasks];
    state.activeTask = undefined;

    const streamStatus =
      result.status === 'completed' || result.status === 'failed' || result.status === 'skipped'
        ? result.status
        : 'completed';
    ledger(
      state,
      'task_done',
      { status: result.status, summary: result.summary },
      { taskId: task.taskId, agentId: result.agentId },
    );
    void emit(onProgress, {
      type: 'task_done',
      payload: { taskId: task.taskId, status: streamStatus, result: result.summary },
    });
    return false;
  }

  function finalize(
    state: OrchestratorState,
    onProgress: OnProgress,
    opts: { suppressUi?: boolean } = {},
  ): OrchestratorState {
    if (state.executionStatus !== 'failed') state.executionStatus = 'completed';
    const evidence = collectAllEvidence(state);
    const text = state.finalResponseDraft ?? defaultSummary(state);
    state.finalResponseDraft = text;

    // Surface chart_data artifacts to the canvas and ask it to switch tab
    // (structured generative UI). Suppressed on cancellation/denial so a cancelled
    // run doesn't yank the user to the data tab. Charts travel via `artifacts`;
    // the client renders from them (no per-chart render_chart action needed).
    const charts = opts.suppressUi
      ? []
      : Object.values(state.artifacts).filter((a) => a.kind === 'chart_data');
    const uiActions: UiAction[] = charts.length > 0 ? [{ action: 'open_tab', tab: 'datos' }] : [];

    void emit(onProgress, {
      type: 'result',
      payload: {
        text,
        uiActions,
        evidence,
        artifacts: charts,
        resultSummary: {
          completedTasks: state.completedTasks.length,
          evidenceCount: evidence.length,
        },
      },
    });
    return state;
  }

  // ── public API ─────────────────────────────────────────────────────────────

  async function start(
    request: NormalizedUserRequest,
    options: RunOptions = {},
  ): Promise<OrchestratorState> {
    const onProgress = options.onProgress ?? noop;
    const state = ingest(request);
    return doPlan(state, request, onProgress);
  }

  async function resume(
    state: OrchestratorState,
    resumption: Resumption,
    options: RunOptions = {},
  ): Promise<OrchestratorState> {
    const onProgress = options.onProgress ?? noop;
    const interrupt = state.interruptState;
    if (!interrupt) return drive(state, onProgress); // nothing pending → just continue

    state.executionStatus = 'running';
    state.interruptState = undefined;

    if (interrupt.reason === 'approval') {
      if (resumption.type !== 'approval') {
        throw new Error('Se esperaba una respuesta de aprobación para reanudar.');
      }
      if (!resumption.approved) {
        ledger(state, 'warning', { code: 'approval_denied' }, { taskId: interrupt.taskId });
        if (interrupt.taskId) {
          state.pendingTasks = state.pendingTasks.filter((t) => t.taskId !== interrupt.taskId);
        }
        state.finalResponseDraft = 'La acción fue cancelada. No se guardó ni exportó nada.';
        return finalize(state, onProgress, { suppressUi: true });
      }
      if (interrupt.taskId) markApproved(state, interrupt.taskId);
      ledger(state, 'approval_granted', {}, { taskId: interrupt.taskId });
      return drive(state, onProgress);
    }

    // clarification
    if (resumption.type !== 'clarification') {
      throw new Error('Se esperaba una respuesta de aclaración para reanudar.');
    }
    state.conversation.decisionLog = [
      ...state.conversation.decisionLog,
      { decision: 'clarification', rationale: resumption.answer, timestamp: clock().toISOString() },
    ];

    if (interrupt.taskId) {
      // agent-origin: inject the answer into ALL remaining tasks (not just the
      // head) so sibling tasks (e.g. docs after data disambiguation) also use the
      // resolved entity instead of the original ambiguous query.
      state.workspace.entityRefs = {
        ...state.workspace.entityRefs,
        clarificationAnswer: resumption.answer,
      };
      state.pendingTasks = state.pendingTasks.map((t) => ({
        ...t,
        inputs: { ...t.inputs, clarificationAnswer: resumption.answer },
      }));
      return drive(state, onProgress);
    }
    // planner-origin: re-plan with the original request + the answer in context
    const original = state.workspace.sharedFacts[REQUEST_KEY] as NormalizedUserRequest | undefined;
    const request: NormalizedUserRequest = {
      text: original?.text ?? resumption.answer,
      sessionId: state.sessionId,
      requestContext: { ...(original?.requestContext ?? {}), clarificationAnswer: resumption.answer },
    };
    return doPlan(state, request, onProgress);
  }

  return { start, resume };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultSummary(state: OrchestratorState): string {
  const summaries = state.completedTasks
    .filter((t) => t.status === 'completed')
    .map((t) => t.summary.trim())
    .filter(Boolean);
  if (summaries.length > 0) return summaries.join(' ');
  if (state.completedTasks.length === 0) return 'No se realizaron acciones.';
  // No successful task. Distinguish "ran but found nothing" from "everything errored".
  const failed = state.completedTasks.filter((t) => t.status === 'failed').length;
  if (failed > 0) {
    return `No se pudo completar la consulta: ${failed} de ${state.completedTasks.length} tarea(s) presentaron errores.`;
  }
  return 'No encontré evidencia en las fuentes consultadas.';
}
