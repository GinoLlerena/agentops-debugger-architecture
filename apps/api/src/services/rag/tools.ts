import { z } from 'zod';
import { defineTool, type ToolDescriptor } from '../tools/types.js';
import type { RagService } from './retriever.js';

const retrievalResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      documentId: z.string(),
      index: z.number().int(),
      text: z.string(),
      metadata: z.record(z.unknown()),
      score: z.number(),
    }),
  ),
});

/**
 * RAG tools (DocsAgent's toolset). Bound to a RagService; Phase 2 wraps them as
 * Mastra tools and maps results to `EvidenceItem`s with citations.
 */
export function createRagTools(rag: RagService): ToolDescriptor[] {
  const retrieve = defineTool({
    id: 'retrieve_oefa_context',
    description:
      'Recupera fragmentos relevantes del corpus OEFA (resoluciones, informes, guías) para una consulta, ' +
      'con filtros opcionales por tipo de documento, fuente o administrado.',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().positive().max(20).optional(),
      documentType: z.string().optional(),
      source: z.string().optional(),
      administrado: z.string().optional(),
    }),
    outputSchema: retrievalResultSchema,
    execute: async ({ query, limit, documentType, source, administrado }) => {
      const results = await rag.retrieve(query, {
        limit,
        filter: { documentType, source, administrado },
      });
      return {
        results: results.map((r) => ({
          id: r.chunk.id,
          documentId: r.chunk.documentId,
          index: r.chunk.index,
          text: r.chunk.text,
          metadata: r.chunk.metadata,
          score: r.score,
        })),
      };
    },
  });

  const indexDoc = defineTool({
    id: 'index_oefa_document',
    description: 'Indexa un documento (texto + metadatos) en el corpus para que pueda ser citado.',
    inputSchema: z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      metadata: z.record(z.unknown()).optional(),
    }),
    outputSchema: z.object({ documentId: z.string(), chunkCount: z.number().int() }),
    execute: async ({ id, text, metadata }) => {
      const chunks = await rag.indexDocument({ id, text, metadata: metadata ?? {} });
      return { documentId: id, chunkCount: chunks.length };
    },
  });

  return [retrieve, indexDoc];
}
