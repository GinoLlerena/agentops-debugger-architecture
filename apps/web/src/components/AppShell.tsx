import { Link } from '@tanstack/react-router';
import { FileText, LayoutDashboard, Library, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Language } from '@agentops/shared';
import { useHealth } from '../lib/api.js';
import { useI18n, type MessageKey } from '../i18n/index.js';

const NAV: { to: string; labelKey: MessageKey; icon: typeof LayoutDashboard }[] = [
  { to: '/', labelKey: 'nav.panel', icon: LayoutDashboard },
  { to: '/oefa', labelKey: 'nav.oefa', icon: Search },
  { to: '/documentos', labelKey: 'nav.documentos', icon: Library },
];

/** Language toggle (ES/EN) — global app preference, persisted by the provider. */
function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <select
      value={language}
      onChange={(e) => {
        const next = Language.safeParse(e.target.value);
        if (next.success) setLanguage(next.data);
      }}
      aria-label={t('lang.label')}
      className="rounded-card border border-linea bg-superficie px-1.5 py-0.5 text-xs text-verde-tinta"
    >
      <option value="es">{t('lang.es')}</option>
      <option value="en">{t('lang.en')}</option>
    </select>
  );
}

/** App shell: institutional nav rail + top bar (UX §3, §8). */
export function AppShell({ children }: { children: ReactNode }) {
  const health = useHealth();
  const { t } = useI18n();
  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="flex w-16 flex-col items-center gap-1 bg-verde-tinta py-3.5 text-white">
        <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-card bg-verde-fiscal font-display text-base font-bold">
          AO
        </div>
        {NAV.map(({ to, labelKey, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            title={t(labelKey)}
            className="flex h-10 w-10 items-center justify-center rounded-card text-white/70 hover:bg-white/10 [&.active]:bg-verde-fiscal [&.active]:text-white"
          >
            <Icon size={18} strokeWidth={1.5} />
          </Link>
        ))}
        <div className="mt-auto flex h-10 w-10 items-center justify-center text-white/40" title={t('app.reports')}>
          <FileText size={18} strokeWidth={1.5} />
        </div>
      </nav>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-13 flex-shrink-0 items-center gap-3 border-b border-linea bg-superficie px-4 py-2">
          <span className="font-display text-base font-semibold">{t('app.title')}</span>
          <span className="eyebrow">{t('app.subtitle')}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gris-ev">
            <span
              className={`h-2 w-2 rounded-full ${health.data?.mode === 'live' ? 'bg-verde-fiscal' : 'bg-azul-dato'}`}
              aria-hidden
            />
            {health.data ? t('app.mode', { mode: health.data.mode }) : '…'}
          </span>
          <LanguageSelector />
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
