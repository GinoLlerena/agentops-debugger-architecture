import type {
  ArtifactRecord,
  DomainTaskPacket,
  DomainTaskResult,
  EvidenceItem,
  OefaRecord,
  Report,
} from '@agentops/shared';
import type { CompanyStats } from '../../services/oefa/oefa-service.js';
import { buildReport } from '../../services/report/build-report.js';
import type { ReportStore } from '../../persistence/report-store.js';
import { messages } from '../../i18n/messages.js';
import { AGENT_IDS } from '../manifests/registry.js';
import type { AgentRunContext, SpecialistAgent } from '../coordinator/types.js';

/**
 * No-LLM Flow A agents: the ReportAgent synthesizes a structured draft from the
 * data/docs evidence already in state and persists it; the ReportManager applies
 * the HITL-approved save (draft → approved). Live equivalents are Mastra agents
 * (Phase 2); chart/report generation in live mode is wired later.
 */

function findRecordSet(ctx: AgentRunContext): { records: OefaRecord[]; stats: CompanyStats } | undefined {
  const art = Object.values(ctx.artifacts).find((a) => a.kind === 'record_set');
  return art?.data as { records: OefaRecord[]; stats: CompanyStats } | undefined;
}

function collectEvidence(ctx: AgentRunContext): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>();
  for (const t of ctx.state.completedTasks) for (const e of t.evidence) byId.set(e.id, e);
  return [...byId.values()];
}

export function createOfflineReportAgent(
  reportStore: ReportStore,
  idgen: () => string,
  clock: () => Date,
): SpecialistAgent {
  return {
    agentId: AGENT_IDS.report,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const m = messages(ctx.state.language);
      const data = findRecordSet(ctx);
      if (!data || data.records.length === 0) {
        return mk(AGENT_IDS.report, task, 'completed', m.insufficientData, {});
      }
      const evidence = collectEvidence(ctx);
      const entity = { administrado: data.records[0]!.administrado, ruc: data.records[0]!.ruc };
      const report = buildReport({
        id: `report-${idgen()}`,
        sessionId: ctx.state.sessionId,
        entity,
        records: data.records,
        stats: data.stats,
        evidence,
        question:
          (ctx.state.workspace.sharedFacts.originalRequest as { text?: string } | undefined)?.text ??
          task.instruction,
        source: `API OEFA · ${data.records[0]!.sourceDatasetId}`,
        coverage: data.records[0]!.coverage,
        asOf: clock().toISOString(),
        agentVersion: '0.1.0',
        language: ctx.state.language,
      });
      // Persist the draft so the client can render it during the approval gate.
      await reportStore.save(report);
      const artifact: ArtifactRecord = {
        id: report.id,
        kind: 'report_draft',
        producedByAgentId: AGENT_IDS.report,
        createdAt: report.createdAt,
        summary: report.title,
        data: report,
      };
      return mk(AGENT_IDS.report, task, 'completed', m.draftGenerated(report.title), {
        artifacts: [artifact],
        findings: report.findings,
      });
    },
  };
}

export function createOfflineReportManager(reportStore: ReportStore): SpecialistAgent {
  return {
    agentId: AGENT_IDS.reportManager,
    async run(task: DomainTaskPacket, ctx: AgentRunContext): Promise<DomainTaskResult> {
      const m = messages(ctx.state.language);
      const draft = Object.values(ctx.artifacts).find((a) => a.kind === 'report_draft');
      if (!draft) {
        return mk(AGENT_IDS.reportManager, task, 'failed', m.noDraft, {
          errors: [{ code: 'no_draft', message: 'Sin borrador', recoverable: false }],
        });
      }
      const saved = await reportStore.setStatus(draft.id, 'approved');
      const title = (saved as Report | undefined)?.title ?? 'Informe';
      return mk(AGENT_IDS.reportManager, task, 'completed', m.reportSaved(title), {});
    },
  };
}

function mk(
  agentId: string,
  task: DomainTaskPacket,
  status: DomainTaskResult['status'],
  summary: string,
  over: Partial<DomainTaskResult>,
): DomainTaskResult {
  return {
    taskId: task.taskId,
    agentId: task.agentId ?? agentId,
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
