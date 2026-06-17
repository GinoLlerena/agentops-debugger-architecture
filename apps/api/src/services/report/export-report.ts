import type { Report } from '@agentops/shared';
import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

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

function entityLine(report: Report): string {
  const ruc = report.subjectEntity.ruc ? ` · RUC ${report.subjectEntity.ruc}` : '';
  return `${report.subjectEntity.name}${ruc} · emitido ${report.issueDate}`;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function toPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
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

    h('Resumen ejecutivo');
    p(`Nivel de riesgo: ${report.executiveSummary.riskLevel}`);
    report.executiveSummary.keyFindings.forEach((k) => p(`• ${k}`));

    h('Hallazgos');
    report.findings.forEach((f) => p(`• ${f.statement} [${f.confidence}]`));

    if (report.warnings.length) {
      h('Advertencias');
      report.warnings.forEach((w) => p(`• [${w.severity}] ${w.statement}`));
    }

    h('Recomendaciones');
    report.recommendations.forEach((r) => p(`• ${r.text} (Fundamento: ${r.rationale})`));

    h('Anexo de fuentes y metodología');
    report.sourcesAnnex.documents.forEach((d) => p(`• ${d}`));
    report.sourcesAnnex.apiQueries.forEach((q) => p(`• ${q}`));

    doc.moveDown(0.8).fontSize(8).fillColor('#5B6661').text(report.disclaimer);
    doc.end();
  });
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function toDocx(report: Report): Promise<Buffer> {
  const heading = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
  const line = (t: string) => new Paragraph({ children: [new TextRun(t)] });

  const children: Paragraph[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    line(entityLine(report)),
    heading('Resumen ejecutivo'),
    line(`Nivel de riesgo: ${report.executiveSummary.riskLevel}`),
    ...report.executiveSummary.keyFindings.map((k) => line(`• ${k}`)),
    heading('Hallazgos'),
    ...report.findings.map((f) => line(`• ${f.statement} [${f.confidence}]`)),
    ...(report.warnings.length
      ? [heading('Advertencias'), ...report.warnings.map((w) => line(`• [${w.severity}] ${w.statement}`))]
      : []),
    heading('Recomendaciones'),
    ...report.recommendations.map((r) => line(`• ${r.text} (Fundamento: ${r.rationale})`)),
    heading('Anexo de fuentes y metodología'),
    ...report.sourcesAnnex.documents.map((d) => line(`• ${d}`)),
    ...report.sourcesAnnex.apiQueries.map((q) => line(`• ${q}`)),
    new Paragraph({ children: [new TextRun({ text: report.disclaimer, size: 16, color: '5B6661' })] }),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

async function toXlsx(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const findings = wb.addWorksheet('Hallazgos');
  findings.addRow(['ID', 'Hallazgo', 'Confianza', 'Evidencia']);
  for (const f of report.findings) {
    findings.addRow([f.id, f.statement, f.confidence, f.evidenceIds.join(', ')]);
  }

  const warnings = wb.addWorksheet('Advertencias');
  warnings.addRow(['ID', 'Severidad', 'Advertencia']);
  for (const w of report.warnings) warnings.addRow([w.id, w.severity, w.statement]);

  const meta = wb.addWorksheet('Metadatos');
  meta.addRow(['Informe', report.title]);
  meta.addRow(['Administrado', report.subjectEntity.name]);
  meta.addRow(['RUC', report.subjectEntity.ruc ?? '—']);
  meta.addRow(['Nivel de riesgo', report.executiveSummary.riskLevel]);
  meta.addRow(['Emitido', report.issueDate]);
  meta.addRow(['Descargo', report.disclaimer]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
