import type { EvidenceItem } from '@agentops/shared';
import { useEffect, useState } from 'react';
import type { ChatState } from '../lib/agent-stream.js';
import { useReport } from '../lib/api.js';
import { useI18n, type MessageKey } from '../i18n/index.js';
import { ChartView } from './charts.js';
import { EvidenceChip } from './evidence.js';
import { ReportView } from './ReportView.js';

type Tab = 'resumen' | 'datos' | 'documentos' | 'informe';
const TABS: { id: Tab; labelKey: MessageKey }[] = [
  { id: 'resumen', labelKey: 'tab.resumen' },
  { id: 'datos', labelKey: 'tab.datos' },
  { id: 'documentos', labelKey: 'tab.documentos' },
  { id: 'informe', labelKey: 'tab.informe' },
];

/** Canvas: "chat drives, canvas remembers" (UX §4.2). Tabs as expediente file-tabs. */
export function Canvas({
  state,
  onOpenEvidence,
}: {
  state: ChatState;
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('resumen');
  // Honor the agent's open_tab request (≤1 auto-switch per turn).
  useEffect(() => {
    if (state.requestedTab) setTab(state.requestedTab);
  }, [state.requestedTab]);
  const timelineCharts = state.charts.filter((c) => c.kind === 'timeline');
  const dataCharts = state.charts.filter((c) => c.kind !== 'timeline');
  // Attribute by the producing agent (stamped by the orchestrator); fall back to
  // the legacy "OEFA:" id prefix only when attribution is absent.
  const isData = (e: EvidenceItem) =>
    e.producedByAgentId ? e.producedByAgentId.includes('data') : e.id.startsWith('OEFA:');
  const oefaEvidence = state.evidence.filter(isData);
  const docEvidence = state.evidence.filter((e) => !isData(e));
  // Stable [E#] label = position in the full accumulated evidence list, so the
  // same item shows the same number in chat, Datos and Documentos.
  const labelFor = (e: EvidenceItem) => `E${state.evidence.findIndex((x) => x.id === e.id) + 1}`;
  const lastResult = [...state.messages].reverse().find((m) => m.kind === 'result');

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-linea bg-papel px-3 pt-2">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id)}
            className={`rounded-t-card border border-b-0 px-3 py-1.5 text-sm ${
              tab === tabDef.id
                ? 'border-linea bg-superficie font-semibold text-verde-tinta'
                : 'border-transparent text-gris-ev hover:text-verde-tinta'
            }`}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'resumen' &&
          (lastResult && lastResult.kind === 'result' ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{lastResult.text}</p>
              {timelineCharts.map((c) => (
                <ChartView key={c.id} spec={c} />
              ))}
              <EvidenceList items={state.evidence} labelFor={labelFor} onOpenEvidence={onOpenEvidence} />
            </div>
          ) : (
            <EmptyState />
          ))}

        {tab === 'datos' &&
          (dataCharts.length || oefaEvidence.length ? (
            <div className="space-y-3">
              {dataCharts.map((c) => (
                <ChartView key={c.id} spec={c} />
              ))}
              {oefaEvidence.length > 0 && (
                <EvidenceList
                  items={oefaEvidence}
                  labelFor={labelFor}
                  onOpenEvidence={onOpenEvidence}
                  dense
                />
              )}
            </div>
          ) : (
            <EmptyState textKey="canvas.empty.datos" />
          ))}

        {tab === 'documentos' &&
          (docEvidence.length ? (
            <EvidenceList items={docEvidence} labelFor={labelFor} onOpenEvidence={onOpenEvidence} dense />
          ) : (
            <EmptyState textKey="canvas.empty.documentos" />
          ))}

        {tab === 'informe' && <InformeTab reportId={state.reportId} onOpenEvidence={onOpenEvidence} evidence={state.evidence} />}
      </div>
    </div>
  );
}

function EvidenceList({
  items,
  labelFor,
  onOpenEvidence,
  dense,
}: {
  items: EvidenceItem[];
  labelFor: (item: EvidenceItem) => string;
  onOpenEvidence: (item: EvidenceItem) => void;
  dense?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-card border border-linea bg-superficie p-2.5 text-sm">
          <div className="flex items-center gap-2">
            <EvidenceChip item={e} label={labelFor(e)} onOpen={onOpenEvidence} />
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

function InformeTab({
  reportId,
  evidence,
  onOpenEvidence,
}: {
  reportId?: string;
  evidence: EvidenceItem[];
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const report = useReport(reportId);
  if (!reportId) {
    return <EmptyState textKey="canvas.empty.reportPending" />;
  }
  if (report.isLoading) return <EmptyState textKey="canvas.empty.reportLoading" />;
  if (!report.data) return <EmptyState textKey="canvas.empty.reportError" />;
  return <ReportView report={report.data} evidence={evidence} onOpenEvidence={onOpenEvidence} />;
}

function EmptyState({ textKey = 'canvas.empty.default' }: { textKey?: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-card border border-dashed border-linea text-sm text-gris-ev">
      {t(textKey)}
    </div>
  );
}
