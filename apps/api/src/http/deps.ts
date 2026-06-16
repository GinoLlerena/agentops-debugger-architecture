import { getEnv, isOefaConfigured, isQwenConfigured, type Env } from '../config/env.js';
import { RUIAS_SEED } from '../data/oefa/index.js';
import { createStores, type Stores } from '../services/storage/index.js';
import { JunarClient } from '../services/oefa/junar-client.js';
import {
  JunarRecordSource,
  OefaService,
  SeedRecordSource,
  type OefaRecordSource,
} from '../services/oefa/oefa-service.js';
import { InMemoryOefaCache } from '../services/oefa/oefa-cache.js';
import { loadSeedCorpus, RagService } from '../services/rag/index.js';
import { maybeCreateEmbedder } from '../services/rag/embeddings.js';
import { createQwenProvider } from '../services/qwen/qwen-provider.js';
import { createCoordinator } from '../orchestration/coordinator/coordinator.js';
import type { Coordinator } from '../orchestration/coordinator/types.js';
import { createSpecialistAgents } from '../orchestration/agents/specialists.js';
import { createQwenPlanner } from '../orchestration/agents/planner.js';
import { createOfflineAgents, createOfflinePlanner } from '../orchestration/offline/offline-agents.js';
import { SessionStore } from '../persistence/session-store.js';

/** Everything the HTTP layer closes over. Built once at startup (or per test). */
export interface AppDeps {
  env: Env;
  mode: 'live' | 'offline';
  stores: Stores;
  oefa: OefaService;
  rag: RagService;
  coordinator: Coordinator;
  sessionStore: SessionStore;
}

/**
 * Wire the application. Uses live integrations when configured, otherwise
 * offline equivalents (seed records, lexical RAG, no-LLM agents) so the server
 * runs end-to-end with zero keys — and the HTTP layer is testable offline.
 */
export async function buildDeps(env: Env = getEnv()): Promise<AppDeps> {
  const stores = await createStores(env);

  const source: OefaRecordSource = isOefaConfigured(env)
    ? new JunarRecordSource(new JunarClient(env))
    : new SeedRecordSource(RUIAS_SEED);
  const oefa = new OefaService(source, new InMemoryOefaCache());

  const rag = new RagService({ embedder: maybeCreateEmbedder(env) });
  await rag.indexDocuments(await loadSeedCorpus());

  const live = isQwenConfigured(env);
  let coordinator: Coordinator;
  if (live) {
    const qwen = createQwenProvider(env);
    coordinator = createCoordinator({
      planner: createQwenPlanner(qwen),
      agents: createSpecialistAgents({ qwen, oefa, rag }),
    });
  } else {
    coordinator = createCoordinator({
      planner: createOfflinePlanner(),
      agents: createOfflineAgents({ oefa, rag }),
    });
  }

  return {
    env,
    mode: live ? 'live' : 'offline',
    stores,
    oefa,
    rag,
    coordinator,
    sessionStore: new SessionStore(stores.documents),
  };
}
