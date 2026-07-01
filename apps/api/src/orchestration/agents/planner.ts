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
      const start = Date.now();
      let res;
      try {
        res = await agent.generate(`${languageDirective(request.language)}\n\n${request.text}`, {
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
      const out = res.object as z.infer<typeof PlanOutputSchema>;
      // Assign task ids ourselves (the coordinator keys ledger/approval state on
      // them); the model only supplies domain/operation/title/instruction.
      const tasks = (out.tasks ?? []).map((t) => ({ ...t, taskId: idgen() }));
      // Infer the discriminator when the model omits it: a clarification object
      // wins, then any tasks → plan, else a direct reply.
      const kind = out.kind ?? (out.clarification ? 'clarification' : tasks.length > 0 ? 'plan' : 'reply');
      if (kind === 'clarification' && out.clarification) {
        return { kind: 'clarification', clarification: out.clarification };
      }
      if (kind === 'reply') {
        return { kind: 'reply', text: out.text ?? 'No encontré evidencia en las fuentes consultadas.' };
      }
      return { kind: 'plan', reasoning: out.reasoning ?? '', tasks };
    },
  };
}
