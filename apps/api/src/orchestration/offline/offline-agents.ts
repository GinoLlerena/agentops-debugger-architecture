import type {
  DomainTaskPacket,
  DomainTaskResult,
  EvidenceItem,
  Finding,
  OefaRecord,
} from '@agentops/shared';
import type { OefaService } from '../../services/oefa/oefa-service.js';
import type { RagService } from '../../services/rag/index.js';
import type { ReportStore } from '../../persistence/report-store.js';
import { createOfflineReportAgent, createOfflineReportManager } from './offline-report-agents.js';
import { foldAccents } from '../../services/util/text.js';
import { buildDataArtifacts, entityQueryFor } from '../data-artifacts.js';
import { messages } from '../../i18n/messages.js';
import { AGENT_IDS } from '../manifests/registry.js';
import type { AgentRunContext, Planner, PlanResult, SpecialistAgent } from '../coordinator/types.js';

/**
 * No-LLM fallback planner + agents. When Qwen is not configured, these let the
 * full Flow B (grounded Q&A) run end-to-end over the seed data — so the server is
 * demoable with zero keys and the HTTP path is testable offline. They call the
 * Phase 1 OEFA/RAG services directly and return real cited evidence; the live
 * Mastra agents replace them when Qwen is available.
 */

/** Does the query ask for a report/informe (Flow A) vs a grounded answer (Flow B)?
 *  Recognizes both Spanish and English intent keywords (offline heuristic). */
function isReportIntent(query: string): boolean {
  return /\b(informe|reporte|genera|elabora|prepara|report|generate|draft|prepare|create)\b/.test(
    foldAccents(query),
  );
}

/** Heuristic planner: any query → resolve entity (data) + ground in docs (RAG);
 *  a report request additionally drafts the report and gates the save on HITL. */
export function createOfflinePlanner(): Planner {
  return {
    async plan({ request }): Promise<PlanResult> {
      const m = messages(request.language);
      const query = request.text.trim();
      if (!query) {
        return { kind: 'reply', text: m.noEvidence };
      }
      const tasks: DomainTaskPacket[] = [
        {
          taskId: 'data',
          domain: 'oefa_data',
          operation: 'search',
          title: m.taskDataTitle,
          instruction: m.taskDataInstruction,
          inputs: { query },
          dependsOn: [],
        },
        {
          taskId: 'docs',
          domain: 'oefa_docs',
          operation: 'search',
          title: m.taskDocsTitle,
          instruction: m.taskDocsInstruction,
          inputs: { query },
          dependsOn: [],
        },
      ];
      if (isReportIntent(query)) {
        tasks.push(
          {
            taskId: 'report',
            domain: 'report',
            operation: 'create',
            title: m.taskReportTitle,
            instruction: m.taskReportInstruction,
            inputs: {},
            dependsOn: ['data', 'docs'],
          },
          {
            taskId: 'save',
            domain: 'report_admin',
            operation: 'create',
            title: m.taskSaveTitle,
            instruction: m.taskSaveInstruction,
            inputs: {},
            dependsOn: ['report'],
          },
        );
      }
      return {
        kind: 'plan',
        reasoning: isReportIntent(query) ? m.reasoningReport : m.reasoningQa,
        tasks,
      };
    },
  };
}

function recordToEvidence(r: OefaRecord): EvidenceItem {
  const amount = r.fineAmountUit != null ? ` (${r.fineAmountUit} UIT)` : '';
  return {
    id: `OEFA:${r.id}`,
    documentTitle: r.resolucionMulta ?? r.resolucionDirectoral ?? `Registro OEFA ${r.id}`,
    resolutionNumber: r.resolucionMulta ?? r.resolucionDirectoral,
    date: r.actoAdministrativoDate,
    passage:
      `${r.administrado}: ${r.hechosImputados ?? 'registro administrativo'} — ` +
      `${r.sanctionType ?? 'medida'}${amount}. Estado: ${r.resolutionStatus}.`,
    confidence: 'directa',
    producedByAgentId: AGENT_IDS.data,
  };
}

/** Offline DataAgent: resolves the entity over seed records; clarifies if ambiguous. */
export function createOfflineDataAgent(oefa: OefaService): SpecialistAgent {
  return {
    agentId: AGENT_IDS.data,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const m = messages(ctx.state.language);
      const answer = task.inputs.clarificationAnswer as string | undefined;
      const query = answer ?? (task.inputs.query as string | undefined) ?? task.instruction;
      const base = await oefa.getRecords();
      const entityQuery = answer ?? entityQueryFor(query, base.records);
      const profile = await oefa.getCompanyProfile(entityQuery);

      if (profile.status === 'ambiguous') {
        return mkResult(AGENT_IDS.data, task, 'needs_user_input', m.disambiguateSummary, {
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
        });
      }

      if (profile.status === 'not_found') {
        return mkResult(AGENT_IDS.data, task, 'completed', m.noEvidence, {});
      }

      const { entity, records, stats } = profile.profile;
      const evidence = records.slice(0, 5).map(recordToEvidence);
      const findings: Finding[] = [
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
      ];
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
      return mkResult(
        AGENT_IDS.data,
        task,
        'completed',
        m.dataSummary({ total: stats.totalRecords, administrado: entity.administrado, firm: stats.firmCount }),
        { evidence, findings, artifacts },
      );
    },
  };
}

/** Offline DocsAgent: retrieves grounding passages from the seed corpus. */
export function createOfflineDocsAgent(rag: RagService): SpecialistAgent {
  return {
    agentId: AGENT_IDS.docs,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const m = messages(ctx.state.language);
      const query =
        (task.inputs.clarificationAnswer as string | undefined) ??
        (task.inputs.query as string | undefined) ??
        task.instruction;
      const results = await rag.retrieve(query, { limit: 3 });
      if (results.length === 0) {
        return mkResult(AGENT_IDS.docs, task, 'completed', m.noDocs, {});
      }
      const evidence: EvidenceItem[] = results.map((r) => ({
        id: r.chunk.id,
        documentTitle: String(r.chunk.metadata.title ?? r.chunk.documentId),
        resolutionNumber: r.chunk.metadata.resolutionNumber as string | undefined,
        page: r.chunk.metadata.page as number | undefined,
        passage: r.chunk.text.slice(0, 240),
        confidence: 'directa',
        producedByAgentId: AGENT_IDS.docs,
      }));
      const findings: Finding[] = [
        {
          id: 'F-docs',
          statement: m.docsFinding(evidence.length),
          evidenceIds: evidence.map((e) => e.id),
          confidence: 'directa',
        },
      ];
      return mkResult(AGENT_IDS.docs, task, 'completed', m.docsSummary(evidence.length), {
        evidence,
        findings,
      });
    },
  };
}

function mkResult(
  agentId: string,
  task: DomainTaskPacket,
  status: DomainTaskResult['status'],
  summary: string,
  over: Partial<DomainTaskResult>,
): DomainTaskResult {
  return {
    taskId: task.taskId,
    agentId: task.agentId ?? agentId, // routeStep sets task.agentId; fall back to the agent's own id
    status,
    summary,
    artifacts: [],
    findings: [],
    evidence: [],
    nextTasks: [],
    errors: [],
    warnings: [],
    ...over,
  };
}

/** The offline specialist agent map (Data + Docs + Report + ReportManager). */
export function createOfflineAgents(deps: {
  oefa: OefaService;
  rag: RagService;
  reportStore: ReportStore;
  idgen?: () => string;
  clock?: () => Date;
}): Record<string, SpecialistAgent> {
  const idgen = deps.idgen ?? (() => crypto.randomUUID().split('-')[0]!);
  const clock = deps.clock ?? (() => new Date());
  return {
    [AGENT_IDS.data]: createOfflineDataAgent(deps.oefa),
    [AGENT_IDS.docs]: createOfflineDocsAgent(deps.rag),
    [AGENT_IDS.report]: createOfflineReportAgent(deps.reportStore, idgen, clock),
    [AGENT_IDS.reportManager]: createOfflineReportManager(deps.reportStore),
  };
}
