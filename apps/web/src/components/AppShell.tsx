import { Link } from '@tanstack/react-router';
import { FileText, LayoutDashboard, Library, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useHealth } from '../lib/api.js';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/oefa', label: 'Explorador OEFA', icon: Search },
  { to: '/documentos', label: 'Documentos', icon: Library },
];

/** App shell: institutional nav rail + top bar (UX §3, §8). */
export function AppShell({ children }: { children: ReactNode }) {
  const health = useHealth();
  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="flex w-16 flex-col items-center gap-1 bg-verde-tinta py-3.5 text-white">
        <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-card bg-verde-fiscal font-display text-base font-bold">
          AO
        </div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            title={label}
            className="flex h-10 w-10 items-center justify-center rounded-card text-white/70 hover:bg-white/10 [&.active]:bg-verde-fiscal [&.active]:text-white"
          >
            <Icon size={18} strokeWidth={1.5} />
          </Link>
        ))}
        <div className="mt-auto flex h-10 w-10 items-center justify-center text-white/40" title="Informes">
          <FileText size={18} strokeWidth={1.5} />
        </div>
      </nav>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-13 flex-shrink-0 items-center gap-3 border-b border-linea bg-superficie px-4 py-2">
          <span className="font-display text-base font-semibold">AgentOps Debugger</span>
          <span className="eyebrow">OEFA · Cumplimiento ambiental</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gris-ev">
            <span
              className={`h-2 w-2 rounded-full ${health.data?.mode === 'live' ? 'bg-verde-fiscal' : 'bg-azul-dato'}`}
              aria-hidden
            />
            {health.data ? `modo ${health.data.mode}` : '…'}
          </span>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
