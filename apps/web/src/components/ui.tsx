import { useEffect, type ReactNode } from 'react';
import { RISK_SEVERITY_LABELS, WARNING_SEVERITY_LABELS, localizeLabel } from '@agentops/shared';
import { useI18n } from '../i18n/index.js';

/** Minimal shadcn-style primitives styled with the project tokens (UX §8). */

/** Localized label for any severity value (warning or risk scale share values). */
const SEVERITY_LABELS = { ...RISK_SEVERITY_LABELS, ...WARNING_SEVERITY_LABELS };

export function Button({
  children,
  onClick,
  variant = 'default',
  type = 'button',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
}) {
  const base =
    'rounded-card px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    default: 'border border-linea bg-superficie text-verde-tinta hover:bg-papel',
    primary: 'bg-verde-fiscal text-white hover:opacity-90',
    ghost: 'text-gris-ev hover:bg-papel',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-card border border-linea bg-superficie ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-linea px-3 py-2">{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

const SEVERITY_STYLES: Record<string, string> = {
  Baja: 'bg-papel text-gris-ev',
  Informativa: 'bg-papel text-gris-ev',
  Media: 'bg-[#FCEED8] text-ambar',
  Advertencia: 'bg-[#FCEED8] text-ambar',
  Alta: 'bg-[#FCE6D8] text-[#C2410C]',
  Crítica: 'bg-[#FBE3E1] text-rojo',
};

/** Severity is never color-only — always icon + label (UX §6.2, accessibility).
 *  `level` is the stored Spanish value; styles/icon key off it, the label is
 *  localized for display. */
export function SeverityTag({ level }: { level: string }) {
  const { language } = useI18n();
  const icon = level === 'Crítica' ? '!' : level === 'Alta' || level === 'Advertencia' ? '▲' : '●';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-2xs font-semibold ${SEVERITY_STYLES[level] ?? 'bg-papel text-gris-ev'}`}
    >
      <span aria-hidden>{icon}</span>
      {localizeLabel(SEVERITY_LABELS, level, language)}
    </span>
  );
}

/** A right-edge side sheet (Evidence drawer / Trazabilidad). Focus-aware, Esc to close. */
export function Sheet({
  open,
  onClose,
  title,
  width = 560,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  // Esc closes the sheet regardless of where focus sits (a panel-level keydown
  // would never fire since focus stays on the trigger/body).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="absolute right-0 top-0 flex h-full flex-col bg-superficie shadow-xl"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-linea px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} title={t('ui.close')}>
            ✕
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gris-ev">
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-azul-dato border-t-transparent"
        aria-hidden
      />
      {label}
    </span>
  );
}
