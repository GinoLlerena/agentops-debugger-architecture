import { useTrace } from '../lib/api.js';
import { Sheet, Spinner } from './ui.js';

/** Humanize a ledger event type into analyst-facing Spanish (UX §7). */
const LABELS: Record<string, string> = {
  turn_opened: 'Turno iniciado',
  plan_created: 'Plan creado',
  task_routed: 'Tarea asignada',
  task_started: 'Tarea iniciada',
  tool_called: 'Herramienta invocada',
  evidence_attached: 'Evidencia adjuntada',
  guardrail_drop: 'Afirmación descartada (sin evidencia)',
  clarification_required: 'Aclaración solicitada',
  approval_required: 'Aprobación requerida',
  approval_granted: 'Aprobación otorgada',
  task_done: 'Tarea completada',
  report_saved: 'Informe guardado',
  warning: 'Advertencia',
  error: 'Error',
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
  const trace = useTrace(sessionId, open);
  const events = trace.data ?? [];
  const drops = events.filter((e) => e.type === 'guardrail_drop');

  return (
    <Sheet open={open} onClose={onClose} title="Trazabilidad">
      {trace.isLoading && <Spinner label="Cargando traza…" />}
      {!trace.isLoading && events.length === 0 && (
        <p className="text-sm text-gris-ev">Aún no hay traza para esta sesión.</p>
      )}
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.seq} className="border-l-2 border-linea pl-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="mono text-2xs text-gris-ev">{String(e.seq).padStart(2, '0')}</span>
              <span className="font-semibold">{LABELS[e.type] ?? e.type}</span>
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
        <h3 className="eyebrow mb-1">Verificación</h3>
        {drops.length === 0 ? (
          <p className="text-sm text-gris-ev">
            No se descartaron afirmaciones por falta de evidencia.
          </p>
        ) : (
          <p className="text-sm text-ambar">
            {drops.reduce((n, d) => n + Number(d.payload.count ?? 0), 0)} afirmación(es) descartada(s)
            por el guardrail de evidencia.
          </p>
        )}
      </section>
    </Sheet>
  );
}
