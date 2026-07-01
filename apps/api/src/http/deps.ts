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
import { DocumentStoreOefaCache } from '../services/oefa/oefa-cache.js';
import { loadSeedCorpus, RagService } from '../services/rag/index.js';
import { maybeCreateEmbedder } from '../services/rag/embeddings.js';
import { createQwenProvider } from '../services/qwen/qwen-provider.js';
import { createCoordinator } from '../orchestration/coordinator/coordinator.js';
import type { Coordinator } from '../orchestration/coordinator/types.js';
import { createSpecialistAgents } from '../orchestration/agents/specialists.js';
import { createQwenPlanner } from '../orchestration/agents/planner.js';
import { createOfflineAgents, createOfflinePlanner } from '../orchestration/offline/offline-agents.js';
import { SessionStore } from '../persistence/session-store.js';
import { ReportStore } from '../persistence/report-store.js';
import { instrumentService } from '../observability/instrument.js';
import { ReportExporter } from '../services/report/report-exporter.js';
import {
  CachedTranslator,
  NoopTranslator,
  QwenTranslator,
  type Translator,
} from '../services/translation/index.js';

/** Everything the HTTP layer closes over. Built once at startup (or per test). */
export interface AppDeps {
  env: Env;
  mode: 'live' | 'offline';
  stores: Stores;
  oefa: OefaService;
  rag: RagService;
  coordinator: Coordinator;
  sessionStore: SessionStore;
  reportStore: ReportStore;
  reportExporter: ReportExporter;
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
  // Durable cache (FR-14): Tablestore in live mode, in-memory document store
  // offline — survives restarts so cached OEFA data is served after a cold start.
  // The service is instrumented so each top-level call made during a run is
  // recorded as a `tool_called` ledger event (the single chokepoint covering both
  // live tool calls and offline direct calls); a no-op outside a run (REST reads).
  const oefa = instrumentService(
    new OefaService(source, new DocumentStoreOefaCache(stores.documents)),
    'oefa',
    ['getRecords', 'searchRecords', 'getCompanyProfile'],
  );

  const rag = instrumentService(new RagService({ embedder: maybeCreateEmbedder(env) }), 'rag', [
    'retrieve',
  ]);
  await rag.indexDocuments(await loadSeedCorpus());

  const reportStore = new ReportStore(stores.documents);

  const live = isQwenConfigured(env);
  let coordinator: Coordinator;
  if (live) {
    const qwen = createQwenProvider(env);
    // Live translator: Qwen-backed, cached durably so a recurring passage costs
    // one model call. Powers cross-lingual retrieval + translated citations.
    const translator: Translator = new CachedTranslator(new QwenTranslator(qwen), stores.documents);
    coordinator = createCoordinator({
      planner: createQwenPlanner(qwen),
      agents: createSpecialistAgents({ qwen, oefa, rag, reportStore, translator }),
      translator,
    });
  } else {
    // Offline: no model → no translation. Citations/queries stay canonical Spanish.
    const translator: Translator = new NoopTranslator();
    coordinator = createCoordinator({
      planner: createOfflinePlanner(),
      agents: createOfflineAgents({ oefa, rag, reportStore, translator }),
      translator,
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
    reportStore,
    reportExporter: new ReportExporter(stores.blobs),
  };
}
