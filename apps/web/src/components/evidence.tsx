import type { EvidenceItem } from '@agentops/shared';
import { Sheet } from './ui.js';

/** The signature evidence chip [E1] (UX §4.7): confidence by border AND label. */
export function EvidenceChip({
  item,
  label,
  onOpen,
}: {
  item: EvidenceItem;
  label: string;
  onOpen: (item: EvidenceItem) => void;
}) {
  const none = item.confidence === 'sin_evidencia';
  const dashed = item.confidence === 'inferencia';
  const cls = none
    ? 'border-gris-ev text-gris-ev'
    : dashed
      ? 'border-dashed border-azul-dato text-azul-dato'
      : 'border-verde-fiscal text-verde-fiscal';
  return (
    <button
      onClick={() => onOpen(item)}
      title={item.passage}
      className={`mono mx-0.5 rounded-chip border bg-superficie px-1 text-2xs ${cls}`}
    >
      {none ? 'sin fuente' : label}
    </button>
  );
}

export function EvidenceDrawer({
  item,
  onClose,
}: {
  item: EvidenceItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={item !== null} onClose={onClose} title="Evidencia" width={440}>
      {item && (
        <div className="space-y-3 text-sm">
          <p className="rounded-card border-l-2 border-verde-fiscal bg-papel p-3 leading-relaxed">
            {item.passage}
          </p>
          <dl className="space-y-1.5 text-xs text-gris-ev">
            <Row label="Documento" value={item.documentTitle} />
            {item.resolutionNumber && <Row label="Resolución" value={item.resolutionNumber} mono />}
            {item.page != null && <Row label="Página" value={String(item.page)} />}
            {item.date && <Row label="Fecha" value={item.date} mono />}
            <Row label="Confianza" value={item.confidence} />
          </dl>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm font-semibold text-azul-dato hover:underline"
            >
              Abrir documento original{item.page != null ? ` (p. ${item.page})` : ''} →
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 flex-shrink-0">{label}</dt>
      <dd className={mono ? 'mono text-verde-tinta' : 'text-verde-tinta'}>{value}</dd>
    </div>
  );
}
