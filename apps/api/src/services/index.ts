/**
 * Backend service layer (Phase 1). Each integration sits behind a typed boundary
 * with an offline-testable default, so the whole app runs with no network/keys:
 * - qwen:    Qwen Cloud (DashScope) model provider
 * - oefa:    OEFA Junar client + normalizer + service + tools (RUIAS seed offline)
 * - storage: DocumentStore/BlobStore ports (in-memory ⇄ Tablestore/OSS)
 * - rag:     chunker + lexical/hybrid retriever + tools
 */
export * as qwen from './qwen/qwen-provider.js';
export * from './storage/index.js';
export { createOefaTools } from './oefa/tools.js';
export * from './oefa/datasets.js';
export * from './oefa/oefa-service.js';
export { InMemoryOefaCache, cacheKey, type OefaCache } from './oefa/oefa-cache.js';
export { JunarClient, JunarError } from './oefa/junar-client.js';
export * from './rag/index.js';
export { defineTool, type ToolDescriptor } from './tools/types.js';
