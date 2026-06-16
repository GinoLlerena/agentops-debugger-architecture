import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useSessions } from '../lib/api.js';
import { Button, Card, Eyebrow } from '../components/ui.js';
import { newSessionId } from '../lib/ids.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE');
}

const KPIS = [
  { label: 'Procesos abiertos', value: '—' },
  { label: 'Nuevas resoluciones (mes)', value: '—' },
  { label: 'Exposición cartera (UIT)', value: '—' },
  { label: 'Alertas activas', value: '—' },
];

/** Panel / dashboard (UX §6.3). KPIs are placeholders until the watchlist (Phase 6). */
export function Dashboard() {
  const sessions = useSessions();
  const navigate = useNavigate();
  const startNew = () => navigate({ to: '/sesiones/$sessionId', params: { sessionId: newSessionId() } });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Panel</h1>
        <Button variant="primary" onClick={startNew}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={16} strokeWidth={2} /> Nueva investigación
          </span>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-3">
            <Eyebrow>{k.label}</Eyebrow>
            <div className="mono mt-1 text-2xl">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b border-linea px-4 py-2.5">
          <h2 className="text-base font-semibold">Investigaciones recientes</h2>
        </div>
        {sessions.isLoading && <div className="p-4 text-sm text-gris-ev">Cargando…</div>}
        {sessions.data?.length === 0 && (
          <div className="p-4 text-sm text-gris-ev">
            Aún no hay investigaciones. Inicia una con “Nueva investigación”.
          </div>
        )}
        <ul>
          {sessions.data?.map((s) => (
            <li key={s.id}>
              <a
                href={`/sesiones/${s.id}`}
                className="flex items-center gap-3 border-b border-linea px-4 py-2.5 text-sm last:border-0 hover:bg-papel"
              >
                <span className="font-semibold">{s.title}</span>
                <span className="mono ml-auto text-2xs text-gris-ev">
                  {s.messageCount} turno(s) · {formatDate(s.updatedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
