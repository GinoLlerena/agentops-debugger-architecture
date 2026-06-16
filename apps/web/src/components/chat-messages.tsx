import type { EvidenceItem, Resumption } from '@agentops/shared';
import type { ChatMessage, TaskRow } from '../lib/agent-stream.js';
import { EvidenceChip } from './evidence.js';
import { Button, Card, CardHeader, Eyebrow, Spinner } from './ui.js';

interface Handlers {
  onOpenEvidence: (item: EvidenceItem) => void;
  onResume: (r: Resumption) => void;
  busy: boolean;
}

export function ChatThread({
  messages,
  handlers,
}: {
  messages: ChatMessage[];
  handlers: Handlers;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <Message key={m.id} message={m} handlers={handlers} />
      ))}
    </div>
  );
}

function Message({ message, handlers }: { message: ChatMessage; handlers: Handlers }) {
  switch (message.kind) {
    case 'user':
      return (
        <div className="self-end max-w-[85%] rounded-[8px_8px_2px_8px] bg-verde-suave px-3 py-2 text-sm">
          {message.text}
        </div>
      );
    case 'plan':
      return <PlanChecklist reasoning={message.reasoning} tasks={message.tasks} />;
    case 'clarification':
      return (
        <Card>
          <CardHeader>
            <Eyebrow>Aclaración</Eyebrow>
          </CardHeader>
          <div className="space-y-2 p-3">
            <p className="text-sm">{message.question}</p>
            <div className="flex flex-wrap gap-2">
              {message.candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={handlers.busy}
                  onClick={() => handlers.onResume({ type: 'clarification', answer: c.ruc ?? c.id })}
                  className="rounded-card border border-linea bg-superficie px-3 py-1.5 text-left text-sm hover:bg-papel disabled:opacity-50"
                >
                  <div className="font-semibold">{c.label}</div>
                  <div className="mono text-2xs text-gris-ev">
                    {[c.ruc, c.sector, c.note].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>
      );
    case 'approval':
      return (
        <Card>
          <CardHeader>
            <Eyebrow>Aprobación requerida</Eyebrow>
          </CardHeader>
          <div className="space-y-3 p-3">
            <p className="text-sm">{message.description}</p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={handlers.busy}
                onClick={() => handlers.onResume({ type: 'approval', approved: true })}
              >
                Aprobar y guardar informe
              </Button>
              <Button
                disabled={handlers.busy}
                onClick={() => handlers.onResume({ type: 'approval', approved: false })}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      );
    case 'result':
      return (
        <Card>
          <CardHeader>
            <span aria-hidden className="text-verde-fiscal">
              ✔
            </span>
            <Eyebrow>Resumen</Eyebrow>
          </CardHeader>
          <div className="space-y-2 p-3">
            <p className="text-sm leading-relaxed">{message.text}</p>
            {message.evidence.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 border-t border-linea pt-2 text-xs text-gris-ev">
                <span>Fuentes:</span>
                {message.evidence.map((e, i) => (
                  <EvidenceChip
                    key={e.id}
                    item={e}
                    label={`E${i + 1}`}
                    onOpen={handlers.onOpenEvidence}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      );
    case 'notice':
      return (
        <div className="rounded-card border-l-2 border-ambar bg-[#FFF8EE] px-3 py-2 text-sm text-ambar">
          {message.text}
        </div>
      );
    case 'error':
      return (
        <div className="rounded-card border-l-2 border-rojo bg-[#FDF0EF] px-3 py-2 text-sm text-rojo">
          {message.message}
        </div>
      );
  }
}

const STATUS_ICON: Record<TaskRow['status'], string> = {
  pending: '○',
  running: '◌',
  done: '✔',
  failed: '⚠',
  skipped: '⏭',
};

function PlanChecklist({ reasoning, tasks }: { reasoning: string; tasks: TaskRow[] }) {
  const running = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  return (
    <Card>
      <CardHeader>
        {running ? <Spinner /> : <span className="text-verde-fiscal">✔</span>}
        <Eyebrow>Plan</Eyebrow>
        <span className="ml-auto mono text-2xs text-gris-ev">
          {doneCount} de {tasks.length}
        </span>
      </CardHeader>
      <div className="space-y-2 p-3">
        <p className="rounded-[0_4px_4px_0] border-l-2 border-verde-fiscal bg-papel px-2.5 py-2 text-sm text-[#3c4944]">
          {reasoning}
        </p>
        <ol className="space-y-1.5" aria-live="polite">
          {tasks.map((t) => (
            <li key={t.taskId} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className={
                  t.status === 'running'
                    ? 'text-azul-dato'
                    : t.status === 'done'
                      ? 'text-verde-fiscal'
                      : t.status === 'failed'
                        ? 'text-ambar'
                        : 'text-gris-ev'
                }
              >
                {STATUS_ICON[t.status]}
              </span>
              <span className="flex-1">
                <span className="font-semibold">{t.title}</span>
                {(t.caption || t.result) && (
                  <span className="block text-xs text-gris-ev">{t.result ?? t.caption}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
