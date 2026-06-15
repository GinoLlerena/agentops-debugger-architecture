import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../services/tools/types.js';
import { toMastraTool, toMastraTools } from './mastra-tool.js';

const echo = defineTool({
  id: 'echo_tool',
  description: 'Devuelve el texto recibido.',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});

describe('toMastraTool', () => {
  it('preserves id, description, and validating schemas on the wrapped tool', () => {
    const tool = toMastraTool(echo);
    expect(tool.id).toBe('echo_tool');
    expect(tool.description).toBe('Devuelve el texto recibido.');
    // Mastra augments the zod schema (adds a JSON-schema accessor) so it is not
    // referentially identical; assert it still validates the same shape.
    expect(tool.inputSchema?.safeParse({ text: 'hola' }).success).toBe(true);
    expect(tool.inputSchema?.safeParse({ nope: 1 }).success).toBe(false);
    expect(tool.outputSchema?.safeParse({ text: 'hola' }).success).toBe(true);
  });

  it('toMastraTools keys tools by id', () => {
    const map = toMastraTools([echo]);
    expect(Object.keys(map)).toEqual(['echo_tool']);
    expect(map.echo_tool!.id).toBe('echo_tool');
  });
});
