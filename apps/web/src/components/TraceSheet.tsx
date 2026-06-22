import { useTrace } from '../lib/api.js';
import { useI18n, type MessageKey } from '../i18n/index.js';
import { Sheet, Spinner } from './ui.js';

/** Ledger event type → catalog key (humanized in the analyst's language, UX §7). */
const EVENT_KEYS: Record<string, MessageKey> = {
  turn_opened: 'trace.event.turn_opened',
  plan_created: 'trace.event.plan_created',
  task_routed: 'trace.event.task_routed',
  task_started: 'trace.event.task_started',
  tool_called: 'trace.event.tool_called',
  llm_call: 'trace.event.llm_call',
  evidence_attached: 'trace.event.evidence_attached',
  guardrail_drop: 'trace.event.guardrail_drop',
  clarification_required: 'trace.event.clarification_required',
  approval_required: 'trace.event.approval_required',
  approval_granted: 'trace.event.approval_granted',
  task_done: 'trace.event.task_done',
  report_saved: 'trace.event.report_saved',
  warning: 'trace.event.warning',
  error: 'trace.event.error',
};

/** Trazabilidad side sheet — the AgentOps debugger surfaced as domain language. */
export function TraceSheet({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const trace = useTrace(sessionId, open);
  const events = trace.data ?? [];
  const drops = events.filter((e) => e.type === 'guardrail_drop');
  const eventLabel = (type: string): string => {
    const key = EVENT_KEYS[type];
    return key ? t(key) : type;
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('trace.title')}>
      {trace.isLoading && <Spinner label={t('trace.loading')} />}
      {!trace.isLoading && events.length === 0 && (
        <p className="text-sm text-gris-ev">{t('trace.empty')}</p>
      )}
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.seq} className="border-l-2 border-linea pl-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="mono text-2xs text-gris-ev">{String(e.seq).padStart(2, '0')}</span>
              <span className="font-semibold">{eventLabel(e.type)}</span>
              {e.agentId && <span className="eyebrow">⚙ {e.agentId}</span>}
            </div>
            {Object.keys(e.payload).length > 0 && (
              <pre className="mt-1 overflow-x-auto rounded-cell bg-papel p-2 text-2xs text-gris-ev">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>

      <section className="mt-4 border-t border-linea pt-3">
        <h3 className="eyebrow mb-1">{t('trace.verification')}</h3>
        {drops.length === 0 ? (
          <p className="text-sm text-gris-ev">{t('trace.noDrops')}</p>
        ) : (
          <p className="text-sm text-ambar">
            {t('trace.drops', {
              n: drops.reduce((n, d) => n + Number(d.payload.count ?? 0), 0),
            })}
          </p>
        )}
      </section>
    </Sheet>
  );
}
