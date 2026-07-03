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
import {
  buildDataArtifacts,
  entityQueryFor,
  recordToEvidence,
  rucInQuestion,
} from '../data-artifacts.js';
import { detectListingIntent, runListingTask } from '../listing.js';
import { messages } from '../../i18n/messages.js';
import {
  createOfflineReportAgent,
  createOfflineReportManager,
} from '../offline/offline-report-agents.js';
import { createOfflineDocsAgent } from '../offline/offline-agents.js';
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
/** Live models improvise status labels ("success", "done", "error") despite the
 *  schema — observed with qwen-plus on the deployed instance. Coerce the common
 *  synonyms instead of failing the whole task on a label mismatch; anything
 *  unrecognized falls through to the default ('completed' — the generate call is
 *  single-shot, so whatever the model returned IS its final answer). */
const TolerantStatus = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const s = v.toLowerCase().trim();
  if (['completed', 'complete', 'success', 'succeeded', 'ok', 'done'].includes(s)) return 'completed';
  if (['failed', 'failure', 'error'].includes(s)) return 'failed';
  if (['needs_user_input', 'needs_input', 'clarification', 'clarification_required'].includes(s)) {
    return 'needs_user_input';
  }
  return undefined;
}, z.enum(['completed', 'failed', 'needs_user_input']).default('completed'));

/** Spanish contract enum ← the English/loose labels live models actually emit. */
const TolerantConfidence = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const s = v.toLowerCase().trim();
  if (['directa', 'direct', 'high', 'alta'].includes(s)) return 'directa';
  if (['inferencia', 'inference', 'inferred', 'indirect', 'medium', 'media'].includes(s)) {
    return 'inferencia';
  }
  if (['sin_evidencia', 'no_evidence', 'none', 'low', 'baja'].includes(s)) return 'sin_evidencia';
  return v;
}, ConfidenceLabel);

/** Map the field aliases models use onto the EvidenceItem contract; leave
 *  everything else for the schema to judge. */
function coerceEvidenceShape(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const e = raw as Record<string, unknown>;
  return {
    ...e,
    documentTitle: e.documentTitle ?? e.title ?? e.documentName ?? e.source ?? e.document,
    passage: e.passage ?? e.text ?? e.snippet ?? e.quote ?? e.excerpt ?? e.content,
    confidence: TolerantConfidence.safeParse(e.confidence).success
      ? TolerantConfidence.parse(e.confidence)
      : e.confidence,
  };
}

/** Salvage what validates and DROP what doesn't, instead of failing the whole
 *  task on one malformed citation (observed live: qwen-plus omits
 *  documentTitle/passage on some items). Uncited findings are already
 *  downgraded by the coordinator's evidence guardrail, so dropping is safe. */
const TolerantEvidenceList = z.preprocess((v) => {
  if (!Array.isArray(v)) return v;
  return v
    .map(coerceEvidenceShape)
    .filter((e) => EvidenceItem.safeParse(e).success);
}, z.array(EvidenceItem).default([]));

const FindingSchema = z.object({
  id: z.string(),
  statement: z.string(),
  evidenceIds: z.array(z.string()).default([]),
  confidence: TolerantConfidence,
});

/** Same salvage policy as evidence (observed live: qwen-plus emits findings
 *  without `statement`, using another key). Alias-map, fill a positional id,
 *  default a missing confidence to the weakest label, drop what still fails. */
const TolerantFindingsList = z.preprocess((v) => {
  if (!Array.isArray(v)) return v;
  return v
    .map((raw, i) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const f = raw as Record<string, unknown>;
      return {
        ...f,
        id: f.id ?? `f${i + 1}`,
        statement: f.statement ?? f.text ?? f.finding ?? f.description ?? f.claim,
        confidence: f.confidence ?? 'sin_evidencia',
      };
    })
    .filter((f) => FindingSchema.safeParse(f).success);
}, z.array(FindingSchema).default([]));

export const AgentOutputSchema = z.object({
  status: TolerantStatus,
  // Also model-variance-prone: qwen-plus sometimes omits it, so it can't be
  // required — resolveSummary() derives a fallback after parsing.
  summary: z.string().optional(),
  findings: TolerantFindingsList,
  evidence: TolerantEvidenceList,
  clarification: ClarificationRequest.optional(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/** The task summary shown in chat/trace: the model's, else the first finding,
 *  else a neutral localized line — never a validation failure. */
export function resolveSummary(out: AgentOutput, language: Language): string {
  const s = out.summary?.trim();
  if (s) return s;
  const first = out.findings[0]?.statement?.trim();
  if (first) return first;
  return language === 'en' ? 'Task completed (no summary provided).' : 'Tarea completada (sin resumen).';
}

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
          summary: resolveSummary(out, ctx.state.language),
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
        // The summary reaches the chat UI — keep it generic; the real error stays
        // in `errors[]` for the trace/debugger (same policy as the HTTP layer).
        return {
          taskId: task.taskId,
          agentId,
          status: 'failed',
          summary:
            ctx.state.language === 'en'
              ? 'The agent could not complete this task.'
              : 'El agente no pudo completar esta tarea.',
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
  clock: () => Date = () => new Date(),
): SpecialistAgent {
  const narrator = toSpecialistAgent(AGENT_IDS.data, agent, modelId);
  return {
    agentId: AGENT_IDS.data,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const original = ctx.state.workspace.sharedFacts.originalRequest as { text?: string } | undefined;
      const clarified = strInput(task.inputs.clarificationAnswer);
      const rawQuery = strInput(task.inputs.query) ?? original?.text ?? task.instruction;
      // A listing question is answered deterministically (entity list as
      // clickable candidates) — no LLM call, so the live model's output variance
      // can't break it and live/offline behave identically. A clarification
      // answer means the user already picked an entity: normal flow below.
      if (!clarified) {
        const intent = detectListingIntent(rawQuery, clock());
        if (intent) {
          return runListingTask({
            task,
            agentId: AGENT_IDS.data,
            oefa,
            intent,
            language: ctx.state.language,
          });
        }
      }
      const result = await narrator.run(task, ctx);
      // Deterministic backstop for a non-completed narrative (live variance,
      // observed with qwen-plus on the deployed instance): the model sometimes
      // claims ambiguity for a query that resolves uniquely, re-asks a
      // clarification the user already answered, or returns needs_user_input
      // without usable candidates (which dead-ends the turn). The entity
      // resolution is deterministic over the records, so verify:
      //   resolves → answer like the offline agent (summary/finding/evidence/artifacts);
      //   genuinely ambiguous (and unanswered) → a candidates card that always works;
      //   otherwise → the narrator's result stands.
      // A "hollow" completion (completed but zero evidence — observed live when
      // the model narrated the wrong entity and the guardrail dropped every
      // uncited finding) is treated the same: in this domain an entity answer
      // without evidence is never legitimate, so the summary must not stand.
      const hollow = result.status === 'completed' && result.evidence.length === 0;
      if (result.status !== 'completed' || hollow) {
        const base = await oefa.getRecords();
        // Live round 8: an LLM hop corrupted a RUC's digits in transit — the
        // planner wrote the task inputs (or the narrator echoed them) with an
        // extra digit ('20543210981' → '205432110981') and the task failed as
        // "malformed RUC" without a single tool call. The user's verbatim
        // message is the authority for a RUC: if it names one that matches a
        // record, resolve deterministically — even for a failed narrative. A
        // failure with no such anchor still passes through untouched.
        const verbatimRuc = clarified
          ? undefined
          : rucInQuestion(original?.text ?? rawQuery, base.records);
        if (result.status === 'failed' && !clarified && !verbatimRuc) return result;
        const entityQuery = clarified ?? verbatimRuc ?? entityQueryFor(rawQuery, base.records);
        const profile = await oefa.getCompanyProfile(entityQuery);
        const m = messages(ctx.state.language);
        if (profile.status === 'ok') {
          const { entity, records, stats } = profile.profile;
          const evidence = records.slice(0, 5).map((r) => recordToEvidence(r, AGENT_IDS.data));
          return {
            ...result,
            status: 'completed',
            clarification: undefined,
            errors: [],
            summary: m.dataSummary({
              total: stats.totalRecords,
              administrado: entity.administrado,
              firm: stats.firmCount,
            }),
            evidence,
            findings: [
              {
                id: 'F-data',
                statement: m.dataFinding({
                  administrado: entity.administrado,
                  total: stats.totalRecords,
                  firm: stats.firmCount,
                  uit: stats.sumFineUit,
                  reincidencia: stats.reincidencia,
                }),
                evidenceIds: evidence.map((e) => e.id),
                confidence: 'directa',
              },
            ],
            artifacts: buildDataArtifacts({
              entity,
              records,
              stats,
              source: `API OEFA · ${base.datasetId}`,
              coverage: base.coverage,
              asOf: base.fetchedAt,
              producedByAgentId: AGENT_IDS.data,
              language: ctx.state.language,
            }),
          };
        }
        if (profile.status === 'ambiguous' && result.status === 'needs_user_input' && !clarified) {
          return {
            ...result,
            summary: m.disambiguateSummary,
            clarification: {
              question: m.clarifyQuestion(profile.candidates.length),
              candidates: profile.candidates.map((c) => ({
                id: c.ruc ?? c.administrado,
                label: c.administrado,
                ruc: c.ruc,
                sector: c.sector,
                note: m.candidateNote(c.recordCount),
              })),
            },
          };
        }
        return result;
      }
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
 * Live Docs agent = Qwen narrator + deterministic retrieval fallback. Observed
 * live (qwen-plus): the model's structured output sometimes fails validation
 * (e.g. an array where the contract wants an object), which failed the docs
 * task outright and left the Documents tab empty; it also completes "hollow" —
 * declaring "no matching records" WITHOUT ever calling its retrieval tool
 * (zero evidence). Retrieval itself is deterministic (BM25/semantic over the
 * seeded corpus), so any narrative that isn't a completed answer WITH evidence
 * is answered by the offline docs agent instead — same evidence contract, same
 * citations, no LLM needed. An honest "no documents" can only come from the
 * deterministic retriever actually finding nothing.
 */
export function toLiveDocsAgent(
  agent: Agent,
  rag: RagService,
  translator: Translator = new NoopTranslator(),
  modelId?: string,
): SpecialistAgent {
  const narrator = toSpecialistAgent(AGENT_IDS.docs, agent, modelId);
  const fallback = createOfflineDocsAgent(rag, translator);
  return {
    agentId: AGENT_IDS.docs,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const result = await narrator.run(task, ctx);
      if (result.status === 'completed' && result.evidence.length > 0) return result;
      return fallback.run(task, ctx);
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
      clock,
    ),
    [AGENT_IDS.docs]: toLiveDocsAgent(
      createDocsMastraAgent(deps.qwen, deps.rag),
      deps.rag,
      translator,
      chatModelId,
    ),
    [AGENT_IDS.report]: createOfflineReportAgent(deps.reportStore, idgen, clock),
    [AGENT_IDS.reportManager]: createOfflineReportManager(deps.reportStore),
  };
}
