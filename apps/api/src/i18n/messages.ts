import { DEFAULT_LANGUAGE, type Language } from '@agentops/shared';

/**
 * Backend narrative catalog. Unlike the web UI chrome (static strings), the
 * agent narrative is templated from data, so each entry is a string or a
 * function of its inputs. `messages(language)` returns the catalog for the run's
 * language; offline agents and the deterministic report/chart builders read it.
 *
 * Scope: text the system AUTHORS (findings, summaries, reasoning, task titles,
 * report/chart labels). Source-citation text (evidence passages quoted verbatim
 * from OEFA records/corpus) stays in the source language and is translated at the
 * presentation edge (see the i18n plan, 5G-c).
 */
export interface Messages {
  /** No-evidence fallback (empty query, not-found, no recall). */
  noEvidence: string;

  // Planner task titles + instructions
  taskDataTitle: string;
  taskDataInstruction: string;
  taskDocsTitle: string;
  taskDocsInstruction: string;
  taskReportTitle: string;
  taskReportInstruction: string;
  taskSaveTitle: string;
  taskSaveInstruction: string;
  reasoningReport: string;
  reasoningQa: string;

  // Data agent
  disambiguateSummary: string;
  clarifyQuestion: (count: number) => string;
  candidateNote: (count: number) => string;
  dataFinding: (p: {
    administrado: string;
    total: number;
    firm: number;
    uit: number;
    reincidencia: boolean;
  }) => string;
  dataSummary: (p: { total: number; administrado: string; firm: number }) => string;

  // Docs agent
  noDocs: string;
  docsFinding: (count: number) => string;
  docsSummary: (count: number) => string;

  // Report agents
  insufficientData: string;
  draftGenerated: (title: string) => string;
  noDraft: string;
  reportSaved: (title: string) => string;

  // Report builder
  confidential: string;
  reportTitle: (administrado: string) => string;
  findingExposure: (p: { administrado: string; total: number; firm: number; uit: number }) => string;
  findingReincidencia: string;
  warningReincidencia: string;
  warningOpen: (count: number) => string;
  recommendationText: string;
  recommendationRationale: string;
  limitation: string;

  // Charts
  chartFinesByYear: string;
  chartStatusDistribution: string;
  chartTimeline: string;
  chartTimelineEntity: (entity: string) => string;
  unitRecords: string;
  timelineFallbackLabel: string;

  /** Coordinator engine user-facing fallbacks (final response / summaries). */
  coord: {
    planFailed: string;
    partialResult: string;
    actionCancelled: string;
    noActions: string;
    tasksFailed: (failed: number, total: number) => string;
  };

  /** Report-export structural labels (PDF/DOCX/XLSX section headings + columns). */
  exp: {
    issued: string;
    execSummary: string;
    riskLevel: string;
    findings: string;
    warnings: string;
    recommendations: string;
    rationale: string;
    sourcesAnnex: string;
    id: string;
    finding: string;
    confidence: string;
    evidence: string;
    severity: string;
    warning: string;
    metadata: string;
    report: string;
    entity: string;
    ruc: string;
    disclaimer: string;
  };
}

const es: Messages = {
  noEvidence: 'No encontré evidencia en las fuentes consultadas.',

  taskDataTitle: 'Buscar registros del administrado',
  taskDataInstruction: 'Resolver la entidad y consultar sus sanciones y medidas.',
  taskDocsTitle: 'Recuperar documentos relacionados',
  taskDocsInstruction: 'Recuperar resoluciones e informes que sustenten la respuesta.',
  taskReportTitle: 'Redactar el informe de antecedentes',
  taskReportInstruction:
    'Cruzar datos y evidencia; redactar hallazgos, advertencias y recomendaciones.',
  taskSaveTitle: 'Guardar el informe',
  taskSaveInstruction: 'Guardar y finalizar el informe (requiere aprobación).',
  reasoningReport:
    'La consulta pide un informe: reúno datos y documentos, redacto el informe y solicito tu aprobación antes de guardarlo.',
  reasoningQa:
    'La consulta requiere historial de cumplimiento: combino datos públicos de OEFA con los documentos del corpus para responder con citas.',

  disambiguateSummary: 'Se requiere desambiguar el administrado.',
  clarifyQuestion: (count) => `Encontré ${count} administrados similares. ¿Cuál?`,
  candidateNote: (count) => `${count} registro(s)`,
  dataFinding: ({ administrado, total, firm, uit, reincidencia }) =>
    `${administrado} registra ${total} acto(s) administrativo(s), ${firm} con resolución firme; ` +
    `exposición ${uit} UIT.${reincidencia ? ' Presenta reincidencia.' : ''}`,
  dataSummary: ({ total, administrado, firm }) =>
    `${total} registros de ${administrado} (${firm} firmes).`,

  noDocs: 'No se recuperaron documentos relevantes.',
  docsFinding: (count) => `Se recuperaron ${count} fragmento(s) documental(es) relacionados.`,
  docsSummary: (count) => `${count} fragmentos recuperados.`,

  insufficientData: 'No hay datos suficientes para el informe.',
  draftGenerated: (title) => `Borrador de informe generado: ${title}.`,
  noDraft: 'No hay un borrador de informe para guardar.',
  reportSaved: (title) => `Informe guardado y aprobado: ${title}.`,

  confidential: 'Confidencial',
  reportTitle: (administrado) => `Informe de Antecedentes Ambientales — ${administrado}`,
  findingExposure: ({ administrado, total, firm, uit }) =>
    `${administrado} registra ${total} acto(s) administrativo(s), de los cuales ${firm} ` +
    `corresponden a resoluciones firmes; la exposición acumulada asciende a ${uit} UIT.`,
  findingReincidencia: 'Se identifica reincidencia en las infracciones imputadas al administrado.',
  warningReincidencia: 'Patrón de reincidencia detectado; mayor probabilidad de agravantes.',
  warningOpen: (count) =>
    `${count} resolución(es) no firme(s) (en proceso o apeladas); el estado puede cambiar.`,
  recommendationText:
    'Se recomienda revisar los instrumentos de gestión ambiental y el cumplimiento de las medidas correctivas dictadas.',
  recommendationRationale:
    'Reduce la exposición a nuevas imputaciones y agravantes por reincidencia.',
  limitation:
    'Basado en información pública a la fecha de consulta; el estado de las resoluciones puede cambiar.',

  chartFinesByYear: '¿Cuánto suma la multa por año?',
  chartStatusDistribution: '¿Cómo se distribuyen las resoluciones por estado?',
  chartTimeline: 'Línea de tiempo procesal',
  chartTimelineEntity: (entity) => `Línea de tiempo procesal · ${entity}`,
  unitRecords: 'registros',
  timelineFallbackLabel: 'Acto administrativo',

  coord: {
    planFailed: 'No se pudo planificar la consulta en este momento. Intenta nuevamente.',
    partialResult: 'Se alcanzó el límite de pasos del agente. Se devuelve un resultado parcial.',
    actionCancelled: 'La acción fue cancelada. No se guardó ni exportó nada.',
    noActions: 'No se realizaron acciones.',
    tasksFailed: (failed, total) =>
      `No se pudo completar la consulta: ${failed} de ${total} tarea(s) presentaron errores.`,
  },

  exp: {
    issued: 'emitido',
    execSummary: 'Resumen ejecutivo',
    riskLevel: 'Nivel de riesgo',
    findings: 'Hallazgos',
    warnings: 'Advertencias',
    recommendations: 'Recomendaciones',
    rationale: 'Fundamento',
    sourcesAnnex: 'Anexo de fuentes y metodología',
    id: 'ID',
    finding: 'Hallazgo',
    confidence: 'Confianza',
    evidence: 'Evidencia',
    severity: 'Severidad',
    warning: 'Advertencia',
    metadata: 'Metadatos',
    report: 'Informe',
    entity: 'Administrado',
    ruc: 'RUC',
    disclaimer: 'Descargo',
  },
};

const en: Messages = {
  noEvidence: 'No evidence found in the sources consulted.',

  taskDataTitle: 'Search the regulated entity’s records',
  taskDataInstruction: 'Resolve the entity and query its sanctions and measures.',
  taskDocsTitle: 'Retrieve related documents',
  taskDocsInstruction: 'Retrieve resolutions and reports that support the answer.',
  taskReportTitle: 'Draft the background report',
  taskReportInstruction:
    'Cross-reference data and evidence; draft findings, warnings and recommendations.',
  taskSaveTitle: 'Save the report',
  taskSaveInstruction: 'Save and finalize the report (requires approval).',
  reasoningReport:
    'The query asks for a report: I gather data and documents, draft the report, and request your approval before saving it.',
  reasoningQa:
    'The query needs a compliance history: I combine OEFA public data with the corpus documents to answer with citations.',

  disambiguateSummary: 'The regulated entity must be disambiguated.',
  clarifyQuestion: (count) => `I found ${count} similar regulated entities. Which one?`,
  candidateNote: (count) => `${count} record(s)`,
  dataFinding: ({ administrado, total, firm, uit, reincidencia }) =>
    `${administrado} has ${total} administrative act(s), ${firm} with a final resolution; ` +
    `exposure ${uit} UIT.${reincidencia ? ' Shows recurrence.' : ''}`,
  dataSummary: ({ total, administrado, firm }) =>
    `${total} records for ${administrado} (${firm} final).`,

  noDocs: 'No relevant documents were retrieved.',
  docsFinding: (count) => `Retrieved ${count} related document fragment(s).`,
  docsSummary: (count) => `${count} fragments retrieved.`,

  insufficientData: 'There is not enough data for the report.',
  draftGenerated: (title) => `Report draft generated: ${title}.`,
  noDraft: 'There is no report draft to save.',
  reportSaved: (title) => `Report saved and approved: ${title}.`,

  confidential: 'Confidential',
  reportTitle: (administrado) => `Environmental Background Report — ${administrado}`,
  findingExposure: ({ administrado, total, firm, uit }) =>
    `${administrado} has ${total} administrative act(s), of which ${firm} are final ` +
    `resolutions; the accumulated exposure amounts to ${uit} UIT.`,
  findingReincidencia: 'Recurrence is identified in the infractions charged to the regulated entity.',
  warningReincidencia: 'Recurrence pattern detected; higher likelihood of aggravating factors.',
  warningOpen: (count) =>
    `${count} non-final resolution(s) (in progress or under appeal); the status may change.`,
  recommendationText:
    'It is recommended to review the environmental management instruments and compliance with the corrective measures issued.',
  recommendationRationale:
    'Reduces exposure to new charges and aggravating factors due to recurrence.',
  limitation:
    'Based on public information as of the consultation date; the status of resolutions may change.',

  chartFinesByYear: 'How much do fines add up to per year?',
  chartStatusDistribution: 'How are resolutions distributed by status?',
  chartTimeline: 'Procedural timeline',
  chartTimelineEntity: (entity) => `Procedural timeline · ${entity}`,
  unitRecords: 'records',
  timelineFallbackLabel: 'Administrative act',

  coord: {
    planFailed: 'The query could not be planned right now. Please try again.',
    partialResult: 'The agent step limit was reached. A partial result is returned.',
    actionCancelled: 'The action was cancelled. Nothing was saved or exported.',
    noActions: 'No actions were taken.',
    tasksFailed: (failed, total) =>
      `The query could not be completed: ${failed} of ${total} task(s) had errors.`,
  },

  exp: {
    issued: 'issued',
    execSummary: 'Executive summary',
    riskLevel: 'Risk level',
    findings: 'Findings',
    warnings: 'Warnings',
    recommendations: 'Recommendations',
    rationale: 'Rationale',
    sourcesAnnex: 'Sources and methodology annex',
    id: 'ID',
    finding: 'Finding',
    confidence: 'Confidence',
    evidence: 'Evidence',
    severity: 'Severity',
    warning: 'Warning',
    metadata: 'Metadata',
    report: 'Report',
    entity: 'Regulated entity',
    ruc: 'RUC',
    disclaimer: 'Disclaimer',
  },
};

const CATALOGS: Record<Language, Messages> = { es, en };

/** The narrative catalog for a run's language (falls back to the default). */
export function messages(language: Language = DEFAULT_LANGUAGE): Messages {
  return CATALOGS[language] ?? CATALOGS[DEFAULT_LANGUAGE];
}
