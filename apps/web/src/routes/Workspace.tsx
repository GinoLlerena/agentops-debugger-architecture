import type { EvidenceItem, ExecutionStatus } from '@agentops/shared';
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '../components/Canvas.js';
import { ChatThread } from '../components/chat-messages.js';
import { EvidenceDrawer } from '../components/evidence.js';
import { TraceSheet } from '../components/TraceSheet.js';
import { Button } from '../components/ui.js';
import { useAgentStream } from '../lib/use-agent.js';
import { useI18n, type MessageKey } from '../i18n/index.js';

const SUGGESTION_KEYS: MessageKey[] = [
  'workspace.suggestion1',
  'workspace.suggestion2',
  'workspace.suggestion3',
];

/** `sessionId` is a prop (the route wrapper keys the component by it) so each
 *  session gets a fresh hook instance with its own state. */
export function Workspace({ sessionId }: { sessionId: string }) {
  const { state, send, resume, hydrating } = useAgentStream(sessionId);
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [evidence, setEvidence] = useState<EvidenceItem | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = state.status === 'running';

  // What the run is suspended on, if anything (clarification vs approval).
  const pending = [...state.messages]
    .reverse()
    .find((m) => m.kind === 'clarification' || m.kind === 'approval');
  const awaitingClarification = state.status === 'waiting' && pending?.kind === 'clarification';
  const awaitingApproval = state.status === 'waiting' && pending?.kind === 'approval';
  // While rehydrating, keep the composer gated so a turn can't start against a
  // `waiting` session before its HITL card is restored (would 409 and lose it).
  const composerDisabled = busy || awaitingApproval || hydrating; // approvals must use the buttons

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll when the user is already near the bottom — task_progress
    // patches arrive constantly during a run, and force-scrolling would yank the
    // view away from someone re-reading the plan.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.messages]);

  const submit = () => {
    if (!input.trim() || composerDisabled) return;
    const text = input;
    setInput('');
    // A free-text reply while awaiting a clarification is a resume, not a new turn.
    if (awaitingClarification) void resume({ type: 'clarification', answer: text });
    else void send(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 flex-shrink-0 items-center gap-3 border-b border-linea bg-superficie px-4">
        <span className="h-2 w-2 rounded-full bg-azul-dato" aria-hidden />
        <span className="text-sm font-semibold">{t('workspace.header', { id: sessionId })}</span>
        <span className="eyebrow">{t(statusKey(state.status))}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setTraceOpen(true)} title={t('workspace.traceTitle')}>
            {t('workspace.trace')}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat column */}
        <section className="flex w-[440px] flex-shrink-0 flex-col border-r border-linea bg-superficie">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {hydrating && state.messages.length === 0 ? (
              <p className="text-sm text-gris-ev">{t('workspace.loadingSession')}</p>
            ) : state.messages.length === 0 ? (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">{t('workspace.emptyHeading')}</h2>
                <p className="text-sm text-gris-ev">{t('workspace.emptyDesc')}</p>
                <div className="space-y-1.5">
                  {SUGGESTION_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => void send(t(key))}
                      className="block w-full rounded-card border border-linea px-3 py-2 text-left text-sm hover:bg-papel"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ChatThread
                messages={state.messages}
                handlers={{
                  onOpenEvidence: setEvidence,
                  onResume: resume,
                  busy,
                  waiting: state.status === 'waiting',
                }}
              />
            )}
          </div>
          <div className="border-t border-linea p-3">
            <div className="flex items-center gap-2 rounded-card border border-linea px-3 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                }}
                disabled={composerDisabled}
                placeholder={
                  awaitingApproval
                    ? t('workspace.placeholder.approval')
                    : awaitingClarification
                      ? t('workspace.placeholder.clarification')
                      : t('workspace.placeholder.default')
                }
                aria-label={t('workspace.inputAria')}
                className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
              />
              <Button variant="primary" onClick={submit} disabled={composerDisabled || !input.trim()}>
                {t('workspace.send')}
              </Button>
            </div>
          </div>
        </section>

        {/* Canvas */}
        <section className="flex-1 overflow-hidden bg-papel">
          <Canvas state={state} onOpenEvidence={setEvidence} />
        </section>
      </div>

      <EvidenceDrawer item={evidence} onClose={() => setEvidence(null)} />
      <TraceSheet sessionId={sessionId} open={traceOpen} onClose={() => setTraceOpen(false)} />
    </div>
  );
}

/** Typed map so adding an ExecutionStatus without a catalog key is a compile error. */
const STATUS_KEYS: Record<ExecutionStatus | 'idle', MessageKey> = {
  idle: 'status.idle',
  running: 'status.running',
  waiting: 'status.waiting',
  completed: 'status.completed',
  failed: 'status.failed',
};

function statusKey(status: ExecutionStatus | 'idle'): MessageKey {
  return STATUS_KEYS[status];
}
