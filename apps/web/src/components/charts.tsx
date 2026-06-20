import type { ChartSpec } from '@agentops/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../i18n/index.js';
import { formatDate, formatNumber } from '../lib/format.js';
import { Card } from './ui.js';

/** Status → colour, always paired with a text label (never colour-only, UX §6.2). */
const STATUS_COLOR: Record<string, string> = {
  firme: '#0E5A47',
  apelada: '#B45309',
  en_proceso: '#1D6FA3',
  anulada: '#B42318',
  archivada: '#5B6661',
  desconocido: '#5B6661',
};

/** Wrapper that carries the question, unit, source + freshness stamp, attribution. */
export function ChartCard({ spec, children }: { spec: ChartSpec; children: React.ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <Card className="p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{spec.title}</h3>
        {spec.unit && <span className="eyebrow">{spec.unit}</span>}
      </div>
      {children}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-linea pt-1.5">
        <span className="mono text-2xs text-gris-ev">
          {spec.source}
          {spec.coverage ? ` · ${t('chart.coverage', { coverage: spec.coverage })}` : ''} ·{' '}
          {/* fall back to the raw asOf string (not "—") when it isn't a parseable date */}
          {t('chart.consulted', { date: formatDate(spec.asOf, locale, spec.asOf) })}
        </span>
        {spec.producedByAgentId && (
          <span className="ml-auto eyebrow">⚙ {spec.producedByAgentId}</span>
        )}
      </div>
    </Card>
  );
}

/** Render a chart spec by kind. */
export function ChartView({ spec }: { spec: ChartSpec }) {
  if (spec.kind === 'bar') return <BarChartView spec={spec} />;
  if (spec.kind === 'severity') return <SegmentedBar spec={spec} />;
  if (spec.kind === 'timeline') return <Timeline spec={spec} />;
  return null;
}

function BarChartView({ spec }: { spec: ChartSpec }) {
  const { locale } = useI18n();
  const data = spec.series.map((p) => ({ name: p.label, value: p.value ?? 0 }));
  return (
    <ChartCard spec={spec}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#E2E6E2" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5B6661' }} />
          <YAxis tick={{ fontSize: 11, fill: '#5B6661' }} width={40} />
          <Tooltip formatter={(v: number) => [`${formatNumber(v, locale)} ${spec.unit ?? ''}`.trim(), '']} />
          <Bar dataKey="value" fill="#0E5A47" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Segmented 100% horizontal bar (not a pie) — count + label + colour per segment. */
function SegmentedBar({ spec }: { spec: ChartSpec }) {
  const total = spec.series.reduce((s, p) => s + (p.value ?? 0), 0) || 1;
  return (
    <ChartCard spec={spec}>
      <div className="flex h-6 overflow-hidden rounded-chip" role="img" aria-label={spec.title}>
        {spec.series.map((p) => {
          const pct = ((p.value ?? 0) / total) * 100;
          return (
            <div
              key={p.label}
              className="flex items-center justify-center text-2xs font-semibold text-white"
              style={{ width: `${pct}%`, backgroundColor: STATUS_COLOR[p.category ?? p.label] ?? '#5B6661' }}
              title={`${p.label}: ${p.value}`}
            >
              {pct > 12 ? p.value : ''}
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-gris-ev">
        {spec.series.map((p) => (
          <li key={p.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[p.category ?? p.label] ?? '#5B6661' }}
              aria-hidden
            />
            {p.label} ({p.value})
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/** Horizontal procedural timeline — dots by outcome, scrollable for long histories. */
function Timeline({ spec }: { spec: ChartSpec }) {
  return (
    <ChartCard spec={spec}>
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-min items-start gap-0">
          {spec.series.map((p, i) => (
            <li key={`${p.label}-${i}`} className="relative flex w-40 flex-shrink-0 flex-col items-center">
              {i < spec.series.length - 1 && (
                <span className="absolute left-1/2 top-2 h-0.5 w-full bg-linea" aria-hidden />
              )}
              <span
                className="relative z-10 h-4 w-4 rounded-full border-2 border-white"
                style={{ backgroundColor: STATUS_COLOR[p.category ?? ''] ?? '#5B6661' }}
                title={`${p.label} · ${p.category ?? ''}`}
              />
              <span className="mono mt-1 text-2xs text-gris-ev">{p.date}</span>
              <span className="mt-0.5 px-1 text-center text-2xs leading-tight">{p.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </ChartCard>
  );
}
