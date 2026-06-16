import type {
  ArtifactRecord,
  DomainTaskPacket,
  DomainTaskResult,
  EvidenceItem,
  Finding,
  OefaRecord,
} from '@agentops/shared';
import type { OefaService } from '../../services/oefa/oefa-service.js';
import type { RagService } from '../../services/rag/index.js';
import { foldAccents } from '../../services/util/text.js';
import { AGENT_IDS } from '../manifests/registry.js';
import type { Planner, PlanResult, SpecialistAgent } from '../coordinator/types.js';

/**
 * No-LLM fallback planner + agents. When Qwen is not configured, these let the
 * full Flow B (grounded Q&A) run end-to-end over the seed data — so the server is
 * demoable with zero keys and the HTTP path is testable offline. They call the
 * Phase 1 OEFA/RAG services directly and return real cited evidence; the live
 * Mastra agents replace them when Qwen is available.
 */

function clean(text: string): string[] {
  return foldAccents(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/** Heuristic planner: any query → resolve entity (data) + ground in docs (RAG). */
export function createOfflinePlanner(): Planner {
  return {
    async plan({ request }): Promise<PlanResult> {
      const query = request.text.trim();
      if (!query) {
        return { kind: 'reply', text: 'No encontré evidencia en las fuentes consultadas.' };
      }
      const tasks: DomainTaskPacket[] = [
        {
          taskId: 'data',
          domain: 'oefa_data',
          operation: 'search',
          title: 'Buscar registros del administrado',
          instruction: 'Resolver la entidad y consultar sus sanciones y medidas.',
          inputs: { query },
          dependsOn: [],
        },
        {
          taskId: 'docs',
          domain: 'oefa_docs',
          operation: 'search',
          title: 'Recuperar documentos relacionados',
          instruction: 'Recuperar resoluciones e informes que sustenten la respuesta.',
          inputs: { query },
          dependsOn: [],
        },
      ];
      return {
        kind: 'plan',
        reasoning:
          'La consulta requiere historial de cumplimiento: combino datos públicos de OEFA con los documentos del corpus para responder con citas.',
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

/** Pick an entity query from a free-text question: an 11-digit RUC wins; else the
 *  longest query token that appears in some administrado name. */
function entityQueryFor(question: string, records: OefaRecord[]): string {
  // Only treat an 11-digit run as a RUC if it actually matches a known record —
  // otherwise a stray document id / number would shadow a company name present
  // in the same question.
  const ruc = question.match(/\b\d{11}\b/);
  if (ruc && records.some((r) => r.ruc === ruc[0])) return ruc[0];
  const nameTokens = new Set(records.flatMap((r) => clean(r.administrado)));
  const candidates = clean(question)
    .filter((t) => nameTokens.has(t))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? question;
}

/** Offline DataAgent: resolves the entity over seed records; clarifies if ambiguous. */
export function createOfflineDataAgent(oefa: OefaService): SpecialistAgent {
  return {
    agentId: AGENT_IDS.data,
    async run(task: DomainTaskPacket): Promise<DomainTaskResult> {
      const answer = task.inputs.clarificationAnswer as string | undefined;
      const query = answer ?? (task.inputs.query as string | undefined) ?? task.instruction;
      const base = await oefa.getRecords();
      const entityQuery = answer ?? entityQueryFor(query, base.records);
      const profile = await oefa.getCompanyProfile(entityQuery);

      if (profile.status === 'ambiguous') {
        return mkResult(AGENT_IDS.data, task, 'needs_user_input', 'Se requiere desambiguar el administrado.', {
          clarification: {
            question: `Encontré ${profile.candidates.length} administrados similares. ¿Cuál?`,
            candidates: profile.candidates.map((c) => ({
              id: c.ruc ?? c.administrado,
              label: c.administrado,
              ruc: c.ruc,
              sector: c.sector,
              note: `${c.recordCount} registro(s)`,
            })),
          },
        });
      }

      if (profile.status === 'not_found') {
        return mkResult(AGENT_IDS.data, task, 'completed', 'No encontré evidencia en las fuentes consultadas.', {});
      }

      const { entity, records, stats } = profile.profile;
      const evidence = records.slice(0, 5).map(recordToEvidence);
      const findings: Finding[] = [
        {
          id: 'F-data',
          statement:
            `${entity.administrado} registra ${stats.totalRecords} acto(s) administrativo(s), ` +
            `${stats.firmCount} con resolución firme; exposición ${stats.sumFineUit} UIT.` +
            (stats.reincidencia ? ' Presenta reincidencia.' : ''),
          evidenceIds: evidence.map((e) => e.id),
          confidence: 'directa',
        },
      ];
      const artifact: ArtifactRecord = {
        id: `records:${entity.ruc ?? entity.administrado}`,
        kind: 'record_set',
        producedByAgentId: AGENT_IDS.data,
        createdAt: base.fetchedAt,
        summary: `${records.length} registros de ${entity.administrado}`,
        data: { records, stats },
      };
      return mkResult(
        AGENT_IDS.data,
        task,
        'completed',
        `${stats.totalRecords} registros de ${entity.administrado} (${stats.firmCount} firmes).`,
        { evidence, findings, artifacts: [artifact] },
      );
    },
  };
}

/** Offline DocsAgent: retrieves grounding passages from the seed corpus. */
export function createOfflineDocsAgent(rag: RagService): SpecialistAgent {
  return {
    agentId: AGENT_IDS.docs,
    async run(task: DomainTaskPacket): Promise<DomainTaskResult> {
      const query =
        (task.inputs.clarificationAnswer as string | undefined) ??
        (task.inputs.query as string | undefined) ??
        task.instruction;
      const results = await rag.retrieve(query, { limit: 3 });
      if (results.length === 0) {
        return mkResult(AGENT_IDS.docs, task, 'completed', 'No se recuperaron documentos relevantes.', {});
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
          statement: `Se recuperaron ${evidence.length} fragmento(s) documental(es) relacionados.`,
          evidenceIds: evidence.map((e) => e.id),
          confidence: 'directa',
        },
      ];
      return mkResult(AGENT_IDS.docs, task, 'completed', `${evidence.length} fragmentos recuperados.`, {
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

/** The offline specialist agent map (Data + Docs). */
export function createOfflineAgents(deps: {
  oefa: OefaService;
  rag: RagService;
}): Record<string, SpecialistAgent> {
  return {
    [AGENT_IDS.data]: createOfflineDataAgent(deps.oefa),
    [AGENT_IDS.docs]: createOfflineDocsAgent(deps.rag),
  };
}
