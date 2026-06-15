import { Agent } from '@mastra/core/agent';
import {
  ClarificationRequest,
  ConfidenceLabel,
  EvidenceItem,
  type DomainTaskPacket,
  type DomainTaskResult,
} from '@agentops/shared';
import { z } from 'zod';
import type { QwenProvider } from '../../services/qwen/qwen-provider.js';
import { createOefaTools } from '../../services/oefa/tools.js';
import type { OefaService } from '../../services/oefa/oefa-service.js';
import { createRagTools, type RagService } from '../../services/rag/index.js';
import { AGENT_IDS } from '../manifests/registry.js';
import type { AgentRunContext, SpecialistAgent } from '../coordinator/types.js';
import { toMastraTools } from './mastra-tool.js';
import {
  DATA_AGENT_PROMPT,
  DOCS_AGENT_PROMPT,
  REPORT_AGENT_PROMPT,
  REPORT_MANAGER_PROMPT,
} from './prompts.js';

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

/** Render a task into a prompt for the specialist agent. */
function taskPrompt(task: DomainTaskPacket): string {
  const inputs = Object.keys(task.inputs).length ? `\nDatos: ${JSON.stringify(task.inputs)}` : '';
  return `Tarea: ${task.title}\nInstrucción: ${task.instruction}${inputs}`;
}

/**
 * Wrap a Mastra Agent as a {@link SpecialistAgent}. Runs the agent with
 * structured output and maps it onto a `DomainTaskResult`. Errors become a failed
 * result (errors are data). Not unit-tested (needs a live model); the
 * orchestration engine is tested with mocked agents instead.
 */
export function toSpecialistAgent(agentId: string, agent: Agent): SpecialistAgent {
  return {
    agentId,
    async run(task: DomainTaskPacket, _ctx: AgentRunContext): Promise<DomainTaskResult> {
      try {
        const res = await agent.generate(taskPrompt(task), {
          structuredOutput: { schema: AgentOutputSchema },
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

export function createReportMastraAgent(qwen: QwenProvider): Agent {
  return new Agent({
    id: AGENT_IDS.report,
    name: 'Agente de Informes',
    instructions: REPORT_AGENT_PROMPT,
    model: qwen.getChatModel(),
  });
}

export function createReportManagerMastraAgent(qwen: QwenProvider): Agent {
  return new Agent({
    id: AGENT_IDS.reportManager,
    name: 'Gestor de Expedientes',
    instructions: REPORT_MANAGER_PROMPT,
    model: qwen.getChatModel(),
  });
}

/** Build the full specialist agent map (Data/Docs/Report/ReportManager) for the Coordinator. */
export function createSpecialistAgents(deps: {
  qwen: QwenProvider;
  oefa: OefaService;
  rag: RagService;
}): Record<string, SpecialistAgent> {
  return {
    [AGENT_IDS.data]: toSpecialistAgent(AGENT_IDS.data, createDataMastraAgent(deps.qwen, deps.oefa)),
    [AGENT_IDS.docs]: toSpecialistAgent(AGENT_IDS.docs, createDocsMastraAgent(deps.qwen, deps.rag)),
    [AGENT_IDS.report]: toSpecialistAgent(AGENT_IDS.report, createReportMastraAgent(deps.qwen)),
    [AGENT_IDS.reportManager]: toSpecialistAgent(
      AGENT_IDS.reportManager,
      createReportManagerMastraAgent(deps.qwen),
    ),
  };
}
