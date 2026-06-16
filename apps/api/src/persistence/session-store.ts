import type { LedgerEvent, OrchestratorState, Session } from '@agentops/shared';
import { COLLECTIONS, type DocumentStore } from '../services/storage/index.js';

/**
 * Persistence for orchestrator runs (architecture §11.2). The full
 * `OrchestratorState` IS our suspend snapshot — persisting it on every turn makes
 * suspend/resume durable across HTTP requests (the `/resume` endpoint loads it).
 * A lightweight `Session` record is maintained alongside for listing.
 */
export class SessionStore {
  constructor(
    private readonly docs: DocumentStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async saveState(state: OrchestratorState): Promise<void> {
    await this.docs.put(COLLECTIONS.snapshots, state.sessionId, state);
    await this.upsertSession(state);
  }

  async loadState(sessionId: string): Promise<OrchestratorState | undefined> {
    return this.docs.get<OrchestratorState>(COLLECTIONS.snapshots, sessionId);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.docs.get<Session>(COLLECTIONS.sessions, sessionId);
  }

  async listSessions(limit?: number): Promise<Session[]> {
    const docs = await this.docs.list<Session>(COLLECTIONS.sessions, { limit });
    return docs
      .map((d) => d.value)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** The execution trace for a session = its ledger (architecture §13). */
  async getTrace(sessionId: string): Promise<LedgerEvent[] | undefined> {
    const state = await this.loadState(sessionId);
    return state?.ledger;
  }

  private async upsertSession(state: OrchestratorState): Promise<void> {
    const now = this.clock().toISOString();
    const existing = await this.getSession(state.sessionId);
    const requestText =
      (state.workspace.sharedFacts.originalRequest as { text?: string } | undefined)?.text ?? '';
    const session: Session = {
      id: state.sessionId,
      title: existing?.title ?? deriveTitle(requestText),
      status: 'active',
      subjectEntity: existing?.subjectEntity,
      lastResultSummary: existing?.lastResultSummary,
      reportIds: existing?.reportIds ?? [],
      messageCount: state.conversation.turnSummaries.length + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.docs.put(COLLECTIONS.sessions, state.sessionId, session);
  }
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Investigación sin título';
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
