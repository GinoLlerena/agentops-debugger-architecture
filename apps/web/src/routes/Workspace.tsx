import type { EvidenceItem } from '@agentops/shared';
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '../components/Canvas.js';
import { ChatThread } from '../components/chat-messages.js';
import { EvidenceDrawer } from '../components/evidence.js';
import { TraceSheet } from '../components/TraceSheet.js';
import { Button } from '../components/ui.js';
import { useAgentStream } from '../lib/use-agent.js';

const SUGGESTIONS = [
  'Genera un informe de antecedentes del RUC 20543210981',
  'Antecedentes del administrado con RUC 20543210981',
  '¿Qué sanciones tiene bambas?',
];

/** `sessionId` is a prop (the route wrapper keys the component by it) so each
 *  session gets a fresh hook instance with its own state. */
export function Workspace({ sessionId }: { sessionId: string }) {
  const { state, send, resume } = useAgentStream(sessionId);
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
  const composerDisabled = busy || awaitingApproval; // approvals must use the buttons

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
        <span className="text-sm font-semibold">Investigación · {sessionId}</span>
        <span className="eyebrow">{statusLabel(state.status)}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setTraceOpen(true)} title="¿Cómo se construyó esta respuesta?">
            Trazabilidad
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat column */}
        <section className="flex w-[440px] flex-shrink-0 flex-col border-r border-linea bg-superficie">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {state.messages.length === 0 ? (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">¿Qué deseas investigar?</h2>
                <p className="text-sm text-gris-ev">
                  Pregunta en lenguaje natural sobre administrados, sanciones y resoluciones de OEFA.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="block w-full rounded-card border border-linea px-3 py-2 text-left text-sm hover:bg-papel"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ChatThread
                messages={state.messages}
                handlers={{ onOpenEvidence: setEvidence, onResume: resume, busy }}
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
                    ? 'Usa los botones de aprobación arriba…'
                    : awaitingClarification
                      ? 'Responde la aclaración…'
                      : 'Escribe tu consulta…'
                }
                aria-label="Consulta"
                className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
              />
              <Button variant="primary" onClick={submit} disabled={composerDisabled || !input.trim()}>
                Enviar
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

function statusLabel(status: string): string {
  return (
    {
      idle: 'Lista',
      running: 'Investigando…',
      waiting: 'Esperando tu respuesta',
      completed: 'Completado',
      failed: 'Con errores',
    }[status] ?? status
  );
}
