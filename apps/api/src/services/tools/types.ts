import type { z } from 'zod';

/**
 * Framework-neutral tool descriptor. Phase 2 wraps these as Mastra tools, but
 * keeping them plain (typed zod I/O + an `execute`) means tools are unit-testable
 * without the agent runtime, and the descriptor doubles as the contract.
 */
export interface ToolDescriptor<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> {
  id: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  execute: (input: z.infer<I>) => Promise<z.infer<O>>;
}

/**
 * Helper to define a tool. The generic parameters give authoring-time inference
 * (the `execute` signature is checked against the schemas), but the return type
 * is **widened** to the erased `ToolDescriptor` so heterogeneous tools collect
 * into a single `ToolDescriptor[]` despite zod's generic invariance.
 */
export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  tool: ToolDescriptor<I, O>,
): ToolDescriptor {
  return tool as unknown as ToolDescriptor;
}
