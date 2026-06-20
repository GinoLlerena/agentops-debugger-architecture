import {
  CONFIDENCE_LABELS,
  RISK_SEVERITY_LABELS,
  WARNING_SEVERITY_LABELS,
  localizeLabel,
  type Report,
} from '@agentops/shared';
import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { messages } from '../../i18n/messages.js';

/**
 * Render a structured Report to PDF / DOCX / XLSX (FR-31). Every format includes
 * the carátula, the report sections, and the mandatory non-editable disclaimer
 * (FR-34). XLSX carries the findings/warnings as data tables.
 */
export type ExportFormat = 'pdf' | 'docx' | 'xlsx';

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The MIME type for an export format — deterministic, so a cached blob can be
 *  served (with the right headers) without re-rendering the file. */
export const contentTypeFor = (format: ExportFormat): string => CONTENT_TYPE[format];

/** The download filename for a report export — deterministic (see above). */
export const exportFilename = (reportId: string, format: ExportFormat): string =>
  `informe-${reportId}.${format}`;

export async function exportReport(report: Report, format: ExportFormat): Promise<ExportedFile> {
  const buffer =
    format === 'pdf'
      ? await toPdf(report)
      : format === 'docx'
        ? await toDocx(report)
        : await toXlsx(report);
  return {
    buffer,
    contentType: contentTypeFor(format),
    filename: exportFilename(report.id, format),
  };
}

/** Localize a stored confidence/severity value to the report's language. */
const SEVERITY_LABELS = { ...RISK_SEVERITY_LABELS, ...WARNING_SEVERITY_LABELS };
const conf = (report: Report, value: string): string =>
  localizeLabel(CONFIDENCE_LABELS, value, report.language);
const sev = (report: Report, value: string): string =>
  localizeLabel(SEVERITY_LABELS, value, report.language);

function entityLine(report: Report): string {
  const ruc = report.subjectEntity.ruc ? ` · RUC ${report.subjectEntity.ruc}` : '';
  return `${report.subjectEntity.name}${ruc} · ${messages(report.language).exp.issued} ${report.issueDate}`;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function toPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const m = messages(report.language);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const h = (t: string) => doc.moveDown(0.6).fontSize(12).fillColor('#0E5A47').text(t);
    const p = (t: string) => doc.fontSize(10).fillColor('#16241F').text(t);

    doc.fontSize(18).fillColor('#16241F').text(report.title);
    doc.fontSize(9).fillColor('#5B6661').text(entityLine(report));
    if (report.confidentialityLabel) doc.text(report.confidentialityLabel);

    h(m.exp.execSummary);
    p(`${m.exp.riskLevel}: ${sev(report, report.executiveSummary.riskLevel)}`);
    report.executiveSummary.keyFindings.forEach((k) => p(`• ${k}`));

    h(m.exp.findings);
    report.findings.forEach((f) => p(`• ${f.statement} [${conf(report, f.confidence)}]`));

    if (report.warnings.length) {
      h(m.exp.warnings);
      report.warnings.forEach((w) => p(`• [${sev(report, w.severity)}] ${w.statement}`));
    }

    h(m.exp.recommendations);
    report.recommendations.forEach((r) => p(`• ${r.text} (${m.exp.rationale}: ${r.rationale})`));

    h(m.exp.sourcesAnnex);
    report.sourcesAnnex.documents.forEach((d) => p(`• ${d}`));
    report.sourcesAnnex.apiQueries.forEach((q) => p(`• ${q}`));

    doc.moveDown(0.8).fontSize(8).fillColor('#5B6661').text(report.disclaimer);
    doc.end();
  });
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function toDocx(report: Report): Promise<Buffer> {
  const m = messages(report.language);
  const heading = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
  const line = (t: string) => new Paragraph({ children: [new TextRun(t)] });

  const children: Paragraph[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    line(entityLine(report)),
    heading(m.exp.execSummary),
    line(`${m.exp.riskLevel}: ${sev(report, report.executiveSummary.riskLevel)}`),
    ...report.executiveSummary.keyFindings.map((k) => line(`• ${k}`)),
    heading(m.exp.findings),
    ...report.findings.map((f) => line(`• ${f.statement} [${conf(report, f.confidence)}]`)),
    ...(report.warnings.length
      ? [heading(m.exp.warnings), ...report.warnings.map((w) => line(`• [${sev(report, w.severity)}] ${w.statement}`))]
      : []),
    heading(m.exp.recommendations),
    ...report.recommendations.map((r) => line(`• ${r.text} (${m.exp.rationale}: ${r.rationale})`)),
    heading(m.exp.sourcesAnnex),
    ...report.sourcesAnnex.documents.map((d) => line(`• ${d}`)),
    ...report.sourcesAnnex.apiQueries.map((q) => line(`• ${q}`)),
    new Paragraph({ children: [new TextRun({ text: report.disclaimer, size: 16, color: '5B6661' })] }),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

async function toXlsx(report: Report): Promise<Buffer> {
  const m = messages(report.language);
  const wb = new ExcelJS.Workbook();

  const findings = wb.addWorksheet(m.exp.findings);
  findings.addRow([m.exp.id, m.exp.finding, m.exp.confidence, m.exp.evidence]);
  for (const f of report.findings) {
    findings.addRow([f.id, f.statement, conf(report, f.confidence), f.evidenceIds.join(', ')]);
  }

  const warnings = wb.addWorksheet(m.exp.warnings);
  warnings.addRow([m.exp.id, m.exp.severity, m.exp.warning]);
  for (const w of report.warnings) warnings.addRow([w.id, sev(report, w.severity), w.statement]);

  const meta = wb.addWorksheet(m.exp.metadata);
  meta.addRow([m.exp.report, report.title]);
  meta.addRow([m.exp.entity, report.subjectEntity.name]);
  meta.addRow([m.exp.ruc, report.subjectEntity.ruc ?? '—']);
  meta.addRow([m.exp.riskLevel, sev(report, report.executiveSummary.riskLevel)]);
  meta.addRow([m.exp.issued, report.issueDate]);
  meta.addRow([m.exp.disclaimer, report.disclaimer]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
