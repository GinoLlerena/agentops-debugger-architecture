import type { EvidenceItem } from '@agentops/shared';
import { useState } from 'react';
import type { ChatState } from '../lib/agent-stream.js';
import { EvidenceChip } from './evidence.js';

type Tab = 'resumen' | 'datos' | 'documentos' | 'informe';
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'datos', label: 'Datos OEFA' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'informe', label: 'Informe' },
];

/** Canvas: "chat drives, canvas remembers" (UX §4.2). Tabs as expediente file-tabs. */
export function Canvas({
  state,
  onOpenEvidence,
}: {
  state: ChatState;
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const [tab, setTab] = useState<Tab>('resumen');
  const oefaEvidence = state.evidence.filter((e) => e.id.startsWith('OEFA:'));
  const docEvidence = state.evidence.filter((e) => !e.id.startsWith('OEFA:'));
  const lastResult = [...state.messages].reverse().find((m) => m.kind === 'result');

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-linea bg-papel px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-card border border-b-0 px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'border-linea bg-superficie font-semibold text-verde-tinta'
                : 'border-transparent text-gris-ev hover:text-verde-tinta'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'resumen' &&
          (lastResult && lastResult.kind === 'result' ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{lastResult.text}</p>
              <EvidenceList items={state.evidence} onOpenEvidence={onOpenEvidence} />
            </div>
          ) : (
            <EmptyState />
          ))}

        {tab === 'datos' &&
          (oefaEvidence.length ? (
            <EvidenceList items={oefaEvidence} onOpenEvidence={onOpenEvidence} dense />
          ) : (
            <EmptyState text="Sin datos para esta sesión todavía." />
          ))}

        {tab === 'documentos' &&
          (docEvidence.length ? (
            <EvidenceList items={docEvidence} onOpenEvidence={onOpenEvidence} dense />
          ) : (
            <EmptyState text="Sin documentos recuperados todavía." />
          ))}

        {tab === 'informe' && (
          <EmptyState text="El informe estructurado se generará tras la aprobación (HITL)." />
        )}
      </div>
    </div>
  );
}

function EvidenceList({
  items,
  onOpenEvidence,
  dense,
}: {
  items: EvidenceItem[];
  onOpenEvidence: (item: EvidenceItem) => void;
  dense?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((e, i) => (
        <li key={e.id} className="rounded-card border border-linea bg-superficie p-2.5 text-sm">
          <div className="flex items-center gap-2">
            <EvidenceChip item={e} label={`E${i + 1}`} onOpen={onOpenEvidence} />
            <span className="mono text-2xs text-gris-ev">{e.documentTitle}</span>
            {e.producedByAgentId && (
              <span className="ml-auto eyebrow">⚙ {e.producedByAgentId}</span>
            )}
          </div>
          {!dense && <p className="mt-1.5 text-xs text-gris-ev">{e.passage}</p>}
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ text = 'El panel se irá llenando con la evidencia de tu investigación.' }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-card border border-dashed border-linea text-sm text-gris-ev">
      {text}
    </div>
  );
}
