import type { EvidenceItem, Resumption } from '@agentops/shared';
import type { ChatMessage, TaskRow } from '../lib/agent-stream.js';
import { useI18n } from '../i18n/index.js';
import { EvidenceChip } from './evidence.js';
import { Button, Card, CardHeader, Eyebrow, Spinner } from './ui.js';

interface Handlers {
  onOpenEvidence: (item: EvidenceItem) => void;
  onResume: (r: Resumption) => void;
  busy: boolean;
  /** True while the session is suspended on an interrupt (status 'waiting'). */
  waiting: boolean;
}

export function ChatThread({
  messages,
  handlers,
}: {
  messages: ChatMessage[];
  handlers: Handlers;
}) {
  // Only the LATEST interrupt card is actionable, and only while the session is
  // still waiting on it. A consumed card stays visible as history but inert —
  // re-clicking an old Approve after the run settled would fire a resume against
  // a lifted interrupt and paint a succeeded session as failed.
  const lastInterruptId = [...messages]
    .reverse()
    .find((m) => m.kind === 'clarification' || m.kind === 'approval')?.id;
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <Message
          key={m.id}
          message={m}
          handlers={handlers}
          interactive={handlers.waiting && m.id === lastInterruptId}
        />
      ))}
    </div>
  );
}

function Message({
  message,
  handlers,
  interactive,
}: {
  message: ChatMessage;
  handlers: Handlers;
  interactive: boolean;
}) {
  const { t } = useI18n();
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
            <Eyebrow>{t('chat.clarification')}</Eyebrow>
          </CardHeader>
          <div className="space-y-2 p-3">
            <p className="text-sm">{message.question}</p>
            <div className="flex flex-wrap gap-2">
              {message.candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={handlers.busy || !interactive}
                  onClick={() => handlers.onResume({ type: 'clarification', answer: c.ruc ?? c.label })}
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
            <Eyebrow>{t('chat.approvalRequired')}</Eyebrow>
          </CardHeader>
          <div className="space-y-3 p-3">
            <p className="text-sm">{message.description}</p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={handlers.busy || !interactive}
                onClick={() => handlers.onResume({ type: 'approval', approved: true })}
              >
                {t('chat.approve')}
              </Button>
              <Button
                disabled={handlers.busy || !interactive}
                onClick={() => handlers.onResume({ type: 'approval', approved: false })}
              >
                {t('chat.cancel')}
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
            <Eyebrow>{t('chat.summary')}</Eyebrow>
          </CardHeader>
          <div className="space-y-2 p-3">
            <p className="text-sm leading-relaxed">{message.text}</p>
            {message.evidence.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 border-t border-linea pt-2 text-xs text-gris-ev">
                <span>{t('chat.sources')}</span>
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
    case 'error': {
      // Client-synthesized stream errors carry a code; translate those to the
      // active language (the raw message is a hardcoded fallback). Server error
      // frames pass through as-is.
      const text =
        message.code === 'no_body'
          ? t('chat.errNoBody')
          : message.code === 'network'
            ? t('chat.errNetwork')
            : message.message;
      return (
        <div className="rounded-card border-l-2 border-rojo bg-[#FDF0EF] px-3 py-2 text-sm text-rojo">
          {text}
        </div>
      );
    }
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
  const { t } = useI18n();
  const active = tasks.some((task) => task.status === 'running' || task.status === 'pending');
  const anyFailed = tasks.some((task) => task.status === 'failed');
  const settled = tasks.filter((task) => task.status === 'done' || task.status === 'failed' || task.status === 'skipped').length;
  const headerIcon = active ? (
    <Spinner />
  ) : anyFailed ? (
    <span className="text-ambar" aria-label={t('chat.ariaErrors')}>
      ⚠
    </span>
  ) : (
    <span className="text-verde-fiscal" aria-label={t('chat.ariaDone')}>
      ✔
    </span>
  );
  return (
    <Card>
      <CardHeader>
        {headerIcon}
        <Eyebrow>{t('chat.plan')}</Eyebrow>
        <span className="ml-auto mono text-2xs text-gris-ev">
          {t('chat.planCount', { settled, total: tasks.length })}
        </span>
      </CardHeader>
      <div className="space-y-2 p-3">
        <p className="rounded-[0_4px_4px_0] border-l-2 border-verde-fiscal bg-papel px-2.5 py-2 text-sm text-[#3c4944]">
          {reasoning}
        </p>
        <ol className="space-y-1.5" aria-live="polite">
          {tasks.map((task) => (
            <li key={task.taskId} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className={
                  task.status === 'running'
                    ? 'text-azul-dato'
                    : task.status === 'done'
                      ? 'text-verde-fiscal'
                      : task.status === 'failed'
                        ? 'text-ambar'
                        : 'text-gris-ev'
                }
              >
                {STATUS_ICON[task.status]}
              </span>
              <span className="flex-1">
                <span className="font-semibold">{task.title}</span>
                {(task.caption || task.result) && (
                  <span className="block text-xs text-gris-ev">{task.result ?? task.caption}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
