import type { EvidenceItem, Report } from '@agentops/shared';
import { useI18n } from '../i18n/index.js';
import { EvidenceChip } from './evidence.js';
import { SeverityTag } from './ui.js';

/**
 * Read-only render of a structured Report following the mandatory skeleton
 * (Reqs §6.2): carátula, resumen ejecutivo, hallazgos (+evidence), advertencias
 * (severity), recomendaciones, anexo de fuentes, and the fixed disclaimer.
 */
export function ReportView({
  report,
  evidence,
  onOpenEvidence,
}: {
  report: Report;
  evidence: EvidenceItem[];
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const { t } = useI18n();
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const labelOf = (id: string) => {
    const idx = evidence.findIndex((e) => e.id === id);
    return idx >= 0 ? `E${idx + 1}` : id;
  };
  const chips = (ids: string[]) =>
    ids
      .map((id) => evById.get(id))
      .filter((e): e is EvidenceItem => Boolean(e))
      .map((e) => <EvidenceChip key={e.id} item={e} label={labelOf(e.id)} onOpen={onOpenEvidence} />);

  return (
    <article className="space-y-4 text-sm leading-relaxed">
      {/* Carátula */}
      <header className="border-b border-linea pb-3">
        <div className="flex items-center gap-2">
          <span className="eyebrow">{report.template}</span>
          <span
            className={`rounded-chip px-1.5 py-0.5 text-2xs font-semibold ${
              report.status === 'approved'
                ? 'bg-verde-suave text-verde-fiscal'
                : 'bg-papel text-gris-ev'
            }`}
          >
            {report.status === 'approved' ? t('report.approved') : t('report.draft')}
          </span>
          {report.confidentialityLabel && (
            <span className="ml-auto eyebrow">{report.confidentialityLabel}</span>
          )}
        </div>
        <h1 className="mt-1 text-xl font-semibold">{report.title}</h1>
        <p className="mono text-2xs text-gris-ev">
          {report.subjectEntity.name}
          {report.subjectEntity.ruc ? ` · RUC ${report.subjectEntity.ruc}` : ''} ·{' '}
          {t('report.issued', { date: report.issueDate })}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="eyebrow">{t('report.export')}</span>
          {(['pdf', 'docx', 'xlsx'] as const).map((fmt) => (
            <a
              key={fmt}
              href={`/reports/${report.id}/export/${fmt}`}
              download
              className="rounded-chip border border-linea px-2 py-0.5 text-2xs font-semibold text-verde-tinta hover:bg-papel"
            >
              {fmt.toUpperCase()}
            </a>
          ))}
        </div>
      </header>

      {/* Resumen ejecutivo */}
      <Section title={t('report.execSummary')}>
        <div className="flex items-center gap-2">
          <span>{t('report.riskLevel')}</span>
          <SeverityTag level={report.executiveSummary.riskLevel} />
        </div>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          {report.executiveSummary.keyFindings.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      </Section>

      {/* Hallazgos */}
      <Section title={t('report.findings')}>
        <ol className="space-y-2">
          {report.findings.map((f) => (
            <li key={f.id}>
              {f.statement} {chips(f.evidenceIds)}
            </li>
          ))}
        </ol>
      </Section>

      {/* Advertencias */}
      {report.warnings.length > 0 && (
        <Section title={t('report.warnings')}>
          <ul className="space-y-1.5">
            {report.warnings.map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <SeverityTag level={w.severity} />
                <span>
                  {w.statement} {chips(w.evidenceIds)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Recomendaciones */}
      <Section title={t('report.recommendations')}>
        <ol className="space-y-1.5">
          {report.recommendations.map((r) => (
            <li key={r.id}>
              {r.text}
              <span className="block text-xs text-gris-ev">
                {t('report.rationale')} {r.rationale}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Anexo de fuentes */}
      <Section title={t('report.sourcesAnnex')}>
        <ul className="mono space-y-0.5 text-2xs text-gris-ev">
          {report.sourcesAnnex.documents.map((d, i) => (
            <li key={`d${i}`}>· {d}</li>
          ))}
          {report.sourcesAnnex.apiQueries.map((q, i) => (
            <li key={`q${i}`}>· {q}</li>
          ))}
          <li>· {t('report.consulted')} {report.sourcesAnnex.consultationDates.join(', ')}</li>
        </ul>
      </Section>

      {/* Descargo de responsabilidad (fijo) */}
      <footer className="whitespace-pre-line rounded-card border-l-2 border-gris-ev bg-papel p-3 text-2xs text-gris-ev">
        {report.disclaimer}
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-1">{title}</h2>
      {children}
    </section>
  );
}
