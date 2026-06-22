import { Agent } from '@mastra/core/agent';
import {
  ClarificationRequest,
  ConfidenceLabel,
  EvidenceItem,
  type DomainTaskPacket,
  type DomainTaskResult,
  type Language,
  type OefaRecord,
} from '@agentops/shared';
import { z } from 'zod';
import type { QwenProvider } from '../../services/qwen/qwen-provider.js';
import { createOefaTools } from '../../services/oefa/tools.js';
import type { OefaService } from '../../services/oefa/oefa-service.js';
import { createRagTools, type RagService } from '../../services/rag/index.js';
import type { ReportStore } from '../../persistence/report-store.js';
import { buildDataArtifacts, entityQueryFor } from '../data-artifacts.js';
import {
  createOfflineReportAgent,
  createOfflineReportManager,
} from '../offline/offline-report-agents.js';
import { AGENT_IDS } from '../manifests/registry.js';
import type { AgentRunContext, SpecialistAgent } from '../coordinator/types.js';
import { toMastraTools } from './mastra-tool.js';
import { DATA_AGENT_PROMPT, DOCS_AGENT_PROMPT, languageDirective } from './prompts.js';
import { recordLlmCall } from '../../observability/instrument.js';
import { NoopTranslator, translateQuery, type Translator } from '../../services/translation/index.js';

/**
 * Structured output we ask each specialist LLM to return. The orchestrator then
 * applies the evidence guardrail to `findings` and merges `evidence`. Tool calls
 * (the real OEFA/RAG work) happen inside `agent.generate`; their results inform
 * this summary and the cited evidence.
 */
const AgentOutputSchema = z.object({
  status: z.enum(['completed', 'failed', 'needs_user_input']).default('completed'),
  summary: z.string(),
  findings: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string(),
        evidenceIds: z.array(z.string()).default([]),
        confidence: ConfidenceLabel,
      }),
    )
    .default([]),
  evidence: z.array(EvidenceItem).default([]),
  clarification: ClarificationRequest.optional(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/** Render a task into a prompt for the specialist agent, in the run's language. */
function taskPrompt(task: DomainTaskPacket, language: Language): string {
  const L =
    language === 'en'
      ? { task: 'Task', instruction: 'Instruction', data: 'Data' }
      : { task: 'Tarea', instruction: 'Instrucción', data: 'Datos' };
  const inputs = Object.keys(task.inputs).length ? `\n${L.data}: ${JSON.stringify(task.inputs)}` : '';
  return `${languageDirective(language)}\n\n${L.task}: ${task.title}\n${L.instruction}: ${task.instruction}${inputs}`;
}

/**
 * Wrap a Mastra Agent as a {@link SpecialistAgent}. Runs the agent with
 * structured output and maps it onto a `DomainTaskResult`. Errors become a failed
 * result (errors are data). Not unit-tested (needs a live model); the
 * orchestration engine is tested with mocked agents instead.
 */
export function toSpecialistAgent(agentId: string, agent: Agent, modelId?: string): SpecialistAgent {
  return {
    agentId,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const start = Date.now();
      try {
        const res = await agent.generate(taskPrompt(task, ctx.state.language), {
          structuredOutput: { schema: AgentOutputSchema },
        });
        recordLlmCall('chat', Date.now() - start, true, {
          model: modelId,
          usage: (res as { usage?: unknown }).usage,
        });
        const out = res.object as AgentOutput;
        return {
          taskId: task.taskId,
          agentId,
          status: out.status,
          summary: out.summary,
          artifacts: [],
          findings: out.findings,
          evidence: out.evidence,
          nextTasks: [],
          clarification: out.clarification,
          errors: [],
          warnings: [],
        };
      } catch (err) {
        recordLlmCall('chat', Date.now() - start, false, { model: modelId });
        return {
          taskId: task.taskId,
          agentId,
          status: 'failed',
          summary: err instanceof Error ? err.message : 'Error del agente',
          artifacts: [],
          findings: [],
          evidence: [],
          nextTasks: [],
          errors: [{ code: 'agent_error', message: String(err), recoverable: false }],
          warnings: [],
        };
      }
    },
  };
}

// ── Mastra Agent factories (wire prompts + Qwen model + Phase 1 tools) ──────────

export function createDataMastraAgent(qwen: QwenProvider, oefa: OefaService): Agent {
  return new Agent({
    id: AGENT_IDS.data,
    name: 'Agente de Datos OEFA',
    instructions: DATA_AGENT_PROMPT,
    model: qwen.getChatModel(),
    tools: toMastraTools(createOefaTools(oefa)),
  });
}

export function createDocsMastraAgent(qwen: QwenProvider, rag: RagService): Agent {
  return new Agent({
    id: AGENT_IDS.docs,
    name: 'Agente de Documentos',
    instructions: DOCS_AGENT_PROMPT,
    model: qwen.getChatModel(),
    tools: toMastraTools(createRagTools(rag)),
  });
}

/** Read a string-valued task input; `inputs` is `z.record(z.unknown())`, so a
 *  live planner could emit a non-string — guard rather than crash downstream. */
function strInput(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The administrado the LLM actually cited (via an `OEFA:<recordId>` evidence id),
 *  if any. Anchoring the deterministic resolution here keeps the materialized
 *  artifacts about the same company as the narrative. */
function entityFromEvidence(evidence: EvidenceItem[], records: OefaRecord[]): string | undefined {
  for (const e of evidence) {
    const recordId = e.id.startsWith('OEFA:') ? e.id.slice('OEFA:'.length) : e.id;
    const rec = records.find((r) => r.id === recordId);
    if (rec) return rec.ruc ?? rec.administrado;
  }
  return undefined;
}

/**
 * Live DataAgent: the Mastra agent (LLM) produces the narrative — summary,
 * findings and cited evidence — and we then deterministically materialize the
 * `record_set` + `chart_data` artifacts from the OEFA service. The LLM alone
 * never emits artifacts, so without this the canvas would have no charts and the
 * ReportAgent (which reads the `record_set`) would have nothing to build from.
 * The artifact step is pure and reuses the same builder as the offline agent,
 * so live and offline produce identical structured data over the same records.
 */
export function toLiveDataAgent(
  agent: Agent,
  oefa: OefaService,
  translator: Translator = new NoopTranslator(),
  modelId?: string,
): SpecialistAgent {
  const narrator = toSpecialistAgent(AGENT_IDS.data, agent, modelId);
  return {
    agentId: AGENT_IDS.data,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const result = await narrator.run(task, ctx);
      // Only attach artifacts for a resolved answer — a clarification or failure
      // has no entity to chart yet.
      if (result.status !== 'completed') return result;
      const original = ctx.state.workspace.sharedFacts.originalRequest as { text?: string } | undefined;
      const clarified = strInput(task.inputs.clarificationAnswer);
      const rawQuery = strInput(task.inputs.query) ?? original?.text ?? task.instruction;
      // Inbound edge: the entity heuristic matches over the Spanish corpus, so a
      // non-Spanish query is translated first (a clarification answer is verbatim).
      const query = clarified ?? (await translateQuery(rawQuery, ctx.state.language, translator));
      const base = await oefa.getRecords();
      // Resolve the entity the artifacts describe: a clarification answer is
      // authoritative; else anchor to the company the LLM cited; else fall back
      // to the query heuristic. This guarantees the charts/records match the
      // narrative instead of silently describing a different administrado.
      const entityQuery =
        clarified ?? entityFromEvidence(result.evidence, base.records) ?? entityQueryFor(query, base.records);
      const profile = await oefa.getCompanyProfile(entityQuery);
      if (profile.status !== 'ok') return result; // ambiguous/not_found → narrative only
      const { entity, records, stats } = profile.profile;
      const artifacts = buildDataArtifacts({
        entity,
        records,
        stats,
        source: `API OEFA · ${base.datasetId}`,
        coverage: base.coverage,
        asOf: base.fetchedAt,
        producedByAgentId: AGENT_IDS.data,
        language: ctx.state.language,
      });
      return { ...result, artifacts: [...result.artifacts, ...artifacts] };
    },
  };
}

/**
 * Build the full specialist agent map (Data/Docs/Report/ReportManager) for the
 * live Coordinator. Data and Docs are Mastra (Qwen) agents; the Report agents
 * are the deterministic builders — a regulatory report carries a mandatory
 * disclaimer (`z.literal`) and findings cited to evidence, so it is assembled
 * from the data, not LLM-rephrased (which could alter the disclaimer or
 * fabricate uncited findings). Both modes therefore share one report builder.
 */
export function createSpecialistAgents(deps: {
  qwen: QwenProvider;
  oefa: OefaService;
  rag: RagService;
  reportStore: ReportStore;
  translator?: Translator;
  idgen?: () => string;
  clock?: () => Date;
}): Record<string, SpecialistAgent> {
  const idgen = deps.idgen ?? (() => crypto.randomUUID().split('-')[0]!);
  const clock = deps.clock ?? (() => new Date());
  const translator = deps.translator ?? new NoopTranslator();
  const chatModelId = deps.qwen.chatModelId;
  return {
    [AGENT_IDS.data]: toLiveDataAgent(
      createDataMastraAgent(deps.qwen, deps.oefa),
      deps.oefa,
      translator,
      chatModelId,
    ),
    [AGENT_IDS.docs]: toSpecialistAgent(
      AGENT_IDS.docs,
      createDocsMastraAgent(deps.qwen, deps.rag),
      chatModelId,
    ),
    [AGENT_IDS.report]: createOfflineReportAgent(deps.reportStore, idgen, clock),
    [AGENT_IDS.reportManager]: createOfflineReportManager(deps.reportStore),
  };
}
