import { createTool } from '@mastra/core/tools';
import type { ToolDescriptor } from '../../services/tools/types.js';

/**
 * Adapt a framework-neutral {@link ToolDescriptor} (Phase 1) into a Mastra tool.
 * Keeping our tools as plain descriptors and wrapping them here means the same
 * tool is unit-testable without the agent runtime and reusable outside Mastra.
 */
export function toMastraTool(descriptor: ToolDescriptor) {
  return createTool({
    id: descriptor.id,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    execute: async (inputData: unknown) => descriptor.execute(inputData),
  });
}

/** Build a Mastra `tools` record (id → tool) from a list of descriptors. */
export function toMastraTools(descriptors: ToolDescriptor[]): Record<string, ReturnType<typeof createTool>> {
  return Object.fromEntries(descriptors.map((d) => [d.id, toMastraTool(d)]));
}
