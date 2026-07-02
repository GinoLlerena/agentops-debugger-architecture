import { Agent } from '@mastra/core/agent';
import { ClarificationRequest, DomainTaskPacket } from '@agentops/shared';
import { z } from 'zod';
import type { QwenProvider } from '../../services/qwen/qwen-provider.js';
import { AGENT_IDS, AGENT_MANIFESTS } from '../manifests/registry.js';
import type { Planner, PlanResult } from '../coordinator/types.js';
import { COORDINATOR_PROMPT, languageDirective } from './prompts.js';
import { recordLlmCall } from '../../observability/instrument.js';

// What we ask the LLM to return. Deliberately looser than the internal task
// contract: `taskId` is assigned by us (line below), never invented by the model,
// and `kind` is optional because models reliably emit the *content* (tasks /
// clarification / text) but not always the discriminator — we infer it. This
// keeps the live planner resilient to normal model output variance.
const PlanOutputSchema = z.object({
  kind: z.enum(['plan', 'clarification', 'reply']).optional(),
  reasoning: z.string().optional(),
  tasks: z.array(DomainTaskPacket.omit({ taskId: true })).optional(),
  clarification: ClarificationRequest.optional(),
  text: z.string().optional(),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

/**
 * Map raw planner output onto a {@link PlanResult}. Pure and exported for tests.
 * `degenerate` marks an answer with no usable content (no tasks, no
 * clarification, no reply text) — observed live when the model nests its plan
 * under an unexpected key. The caller should retry once on degenerate output
 * rather than surface a misleading canned reply.
 */
export function interpretPlanOutput(
  out: PlanOutput,
  idgen: () => string,
  language: 'es' | 'en',
): { result: PlanResult; degenerate: boolean } {
  // Assign task ids ourselves (the coordinator keys ledger/approval state on
  // them); the model only supplies domain/operation/title/instruction.
  const tasks = (out.tasks ?? []).map((t) => ({ ...t, taskId: idgen() }));
  // A save (report_admin/create) without a draft (report/create) can never
  // succeed — the ReportManager persists an existing draft. Observed live:
  // the planner schedules the save alone, the user approves, and the run ends
  // with "no draft to save". Insert the draft task rather than fail post-approval.
  const saveIdx = tasks.findIndex((t) => t.domain === 'report_admin' && t.operation === 'create');
  const hasDraft = tasks.some((t) => t.domain === 'report' && t.operation === 'create');
  if (saveIdx >= 0 && !hasDraft) {
    tasks.splice(saveIdx, 0, {
      taskId: idgen(),
      domain: 'report',
      operation: 'create',
      title: language === 'en' ? 'Draft the report' : 'Elaborar borrador de informe',
      instruction:
        language === 'en'
          ? 'Assemble the draft report from the retrieved records and cited evidence.'
          : 'Elaborar el borrador del informe a partir de los registros recuperados y la evidencia citada.',
      inputs: {},
      dependsOn: [],
    });
  }
  // Infer the discriminator when the model omits it: a clarification object
  // wins, then any tasks → plan, else a direct reply.
  const kind = out.kind ?? (out.clarification ? 'clarification' : tasks.length > 0 ? 'plan' : 'reply');
  if (kind === 'clarification' && out.clarification) {
    return { result: { kind: 'clarification', clarification: out.clarification }, degenerate: false };
  }
  if (kind === 'plan' && tasks.length > 0) {
    return { result: { kind: 'plan', reasoning: out.reasoning ?? '', tasks }, degenerate: false };
  }
  // Reply path (explicit, inferred, or a "plan" with zero tasks): honest text
  // only — prefer the model's reply, then its reasoning; the canned fallback
  // must not claim sources were consulted when nothing ran.
  const text = out.text?.trim() || out.reasoning?.trim();
  return {
    result: {
      kind: 'reply',
      text:
        text ??
        (language === 'en'
          ? 'I could not derive a plan for this query. Please rephrase it.'
          : 'No pude derivar un plan para esta consulta. Por favor, reformúlala.'),
    },
    degenerate: !text,
  };
}

/** A one-line summary of the routable domain+operation pairs, injected into the prompt. */
function manifestSummary(): string {
  return AGENT_MANIFESTS.map(
    (m) => `- ${m.displayName} (${m.agentId}): dominios [${m.ownsDomains.join(', ')}], operaciones [${m.supportedOperations.join(', ')}]`,
  ).join('\n');
}

/**
 * Qwen-backed Coordinator planner (Mastra Agent, no tools). Returns a typed
 * {@link PlanResult}. Not unit-tested (needs a live model); the engine is tested
 * with a mocked planner.
 */
export function createQwenPlanner(
  qwen: QwenProvider,
  idgen: () => string = () => crypto.randomUUID().split('-')[0]!,
): Planner {
  const agent = new Agent({
    id: AGENT_IDS.coordinator,
    name: 'Coordinador',
    instructions: `${COORDINATOR_PROMPT}\n\nAgentes disponibles:\n${manifestSummary()}`,
    model: qwen.getPlannerModel(),
  });

  return {
    async plan({ request }): Promise<PlanResult> {
      const prompt = `${languageDirective(request.language)}\n\n${request.text}`;
      // Up to 2 attempts: degenerate output (no tasks/clarification/text) is
      // model variance, not a property of the query — one retry usually lands.
      let last: { result: PlanResult; degenerate: boolean } | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const start = Date.now();
        let res;
        try {
          res = await agent.generate(prompt, {
            structuredOutput: { schema: PlanOutputSchema },
          });
        } catch (err) {
          recordLlmCall('planner', Date.now() - start, false, { model: qwen.plannerModelId });
          throw err;
        }
        recordLlmCall('planner', Date.now() - start, true, {
          model: qwen.plannerModelId,
          usage: (res as { usage?: unknown }).usage,
        });
        last = interpretPlanOutput(res.object as PlanOutput, idgen, request.language);
        if (!last.degenerate) return last.result;
      }
      return last!.result;
    },
  };
}
