/**
 * Valid fixtures for every contract. Used by contract tests to assert that each
 * schema parses real-shaped data. Committed so tests run with no network/no key.
 * Values mirror the worked example in the specs (Refinería La Pampilla).
 */
import { MANDATORY_DISCLAIMER } from '../report.js';

const TS = '2026-06-13T14:32:00.000Z';

export const validOefaRecord = {
  id: 'RESOL-CON-MULTA-FIRME:row-001',
  administrado: 'Refinería La Pampilla S.A.A.',
  ruc: '20100110663',
  unidadFiscalizable: 'Refinería La Pampilla',
  location: { departamento: 'Callao', provincia: 'Callao', distrito: 'Ventanilla' },
  sector: 'Hidrocarburos',
  subsector: 'Refinación',
  hechosImputados: 'Exceso de LMP en efluentes.',
  normativaIncumplida: 'D.S. 003-2010-MINAM',
  resolucionMulta: 'Resolución N.° 1245-2023-OEFA/DFAI',
  sanctionType: 'Multa',
  dictatedMeasure: 'Medida correctiva',
  fineAmountUit: 320,
  fineAmountSoles: 1712000,
  uitYear: 2023,
  reincidencia: true,
  resolutionStatus: 'firme',
  sourceDatasetId: 'resoluciones-multa-firmes',
  sourceDatasetGuid: 'RESOL-CON-MULTA-FIRME',
  fetchedAt: TS,
  coverage: '2019-2025',
};

export const validOefaDatasetConfig = {
  id: 'resoluciones-multa-firmes',
  guid: 'RESOL-CON-MULTA-FIRME',
  type: 'datastream',
  description: 'Resoluciones con multa firmes 2019-2025 (núcleo del informe)',
};

export const validOefaQueryResult = {
  records: [validOefaRecord],
  total: 8,
  partial: false,
  fromCache: false,
  fetchedAt: TS,
  datasetId: 'resoluciones-multa-firmes',
  coverage: '2019-2025',
};

export const validEvidenceItem = {
  id: 'E1',
  documentTitle: 'Resolución Directoral 1245-2023-OEFA/DFAI',
  resolutionNumber: 'Resolución N.° 1245-2023-OEFA/DFAI',
  page: 14,
  paragraph: 'considerando 7',
  date: '12/03/2023',
  sourceUrl: 'https://example.gob.pe/res/1245-2023.pdf',
  passage: 'Se determina responsabilidad administrativa por exceso de LMP en efluentes.',
  confidence: 'directa',
  producedByAgentId: 'docs-agent',
};

export const validArtifactRecord = {
  id: 'art-records-001',
  kind: 'record_set',
  producedByAgentId: 'data-agent',
  createdAt: TS,
  summary: '8 sanciones firmes (2019-2025)',
  data: { records: [validOefaRecord] },
};

export const validFinding = {
  id: 'F1',
  statement: 'La empresa presenta reincidencia en exceso de LMP en efluentes.',
  evidenceIds: ['E1', 'E2'],
  confidence: 'directa',
};

export const validDomainTaskPacket = {
  taskId: 'task-1',
  domain: 'oefa_data',
  operation: 'search',
  title: 'Buscar registros del administrado',
  instruction: 'Resolver RUC y consultar RESOL-CON-MULTA-FIRME y REGIS-ACTOS-ADMIN-96376.',
  inputs: { entity: 'Refinería La Pampilla' },
  dependsOn: [],
};

export const validClarificationRequest = {
  question: 'Encontré 3 administrados similares: ¿cuál?',
  candidates: [
    { id: 'c1', label: 'Refinería La Pampilla S.A.A.', ruc: '20100110663', sector: 'Hidrocarburos' },
    { id: 'c2', label: 'La Pampilla Servicios S.A.C.', ruc: '20512345678', sector: 'Industria' },
  ],
};

export const validDomainTaskResult = {
  taskId: 'task-1',
  agentId: 'data-agent',
  status: 'completed',
  summary: '124 registros, 8 con sanción firme.',
  artifacts: [validArtifactRecord],
  findings: [validFinding],
  evidence: [validEvidenceItem],
  nextTasks: [],
  errors: [],
  warnings: [],
};

export const validAgentManifest = {
  agentId: 'data-agent',
  displayName: 'Agente de Datos OEFA',
  ownsDomains: ['oefa_data'],
  supportedOperations: ['search', 'explain', 'verify'],
  toolNames: ['search_oefa_records', 'get_company_oefa_profile'],
  approvalPolicy: 'none',
};

export const validLedgerEvent = {
  seq: 3,
  sessionId: 'session-1',
  runId: 'run-1',
  type: 'tool_called',
  timestamp: TS,
  agentId: 'data-agent',
  taskId: 'task-1',
  payload: { tool: 'search_oefa_records', durationMs: 842, resultSize: 124 },
};

export const validOrchestratorState = {
  runId: 'run-1',
  threadId: 'thread-1',
  sessionId: 'session-1',
  executionStatus: 'running',
  workspace: { domains: {}, sharedFacts: {}, entityRefs: { 'Refinería La Pampilla': '20100110663' } },
  conversation: {
    rollingSummary: 'Investigación de antecedentes de La Pampilla.',
    turnSummaries: [],
    entityIndex: {},
    decisionLog: [],
  },
  activeTask: validDomainTaskPacket,
  pendingTasks: [],
  completedTasks: [],
  artifacts: { 'art-records-001': validArtifactRecord },
  ledger: [validLedgerEvent],
};

export const validReport = {
  id: 'report-042',
  sessionId: 'session-1',
  template: 'antecedentes',
  status: 'draft',
  title: 'Informe de Antecedentes Ambientales — Refinería La Pampilla S.A.A.',
  subjectEntity: { name: 'Refinería La Pampilla S.A.A.', ruc: '20100110663' },
  periodAnalyzed: { from: '2019', to: '2025' },
  issueDate: '13/06/2026',
  confidentialityLabel: 'Confidencial',
  executiveSummary: {
    keyFindings: ['8 sanciones firmes', '2 PAS en trámite'],
    riskLevel: 'Alta',
    topRecommendations: ['Reforzar monitoreo de efluentes.'],
  },
  scopeAndMethodology: {
    questionsAddressed: ['¿Qué sanciones firmes tiene la empresa?'],
    sourcesConsulted: ['RESOL-CON-MULTA-FIRME', 'REGIS-ACTOS-ADMIN-96376'],
    consultationDates: ['13/06/2026'],
    limitations: ['Datos públicos a la fecha de consulta.'],
  },
  findings: [validFinding],
  visualizations: [{ id: 'V1', type: 'C1', title: 'Línea de tiempo procesal', artifactId: 'art-tl-1' }],
  warnings: [
    { id: 'W1', severity: 'Advertencia', statement: 'Reincidencia detectada.', evidenceIds: ['E1'] },
  ],
  recommendations: [
    { id: 'R1', text: 'Se recomienda revisar el plan de manejo de efluentes.', rationale: 'Reincidencia.', sourceIds: ['E1'] },
  ],
  sourcesAnnex: {
    documents: ['Resolución N.° 1245-2023-OEFA/DFAI'],
    apiQueries: ['RESOL-CON-MULTA-FIRME?ruc=20100110663'],
    consultationDates: ['13/06/2026'],
  },
  disclaimer: MANDATORY_DISCLAIMER,
  versions: { agentVersion: '0.1.0', model: 'qwen-plus' },
  createdAt: TS,
  updatedAt: TS,
};

export const validSession = {
  id: 'session-1',
  title: 'Antecedentes – Refinería La Pampilla',
  status: 'active',
  subjectEntity: { name: 'Refinería La Pampilla S.A.A.', ruc: '20100110663' },
  lastResultSummary: {
    title: 'Antecedentes La Pampilla S.A.A.',
    stats: ['8 sanciones (2019–2025)', '2 PAS en trámite', 'Exposición: 1,240 UIT'],
    keyFinding: 'Reincidencia en exceso de LMP en efluentes',
    riskLevel: 'Alta',
    evidenceCount: 5,
  },
  reportIds: ['report-042'],
  messageCount: 6,
  createdAt: TS,
  updatedAt: TS,
};

export const validNormalizedUserRequest = {
  text: 'Genera un informe de antecedentes de Refinería La Pampilla con sus medidas correctivas.',
  sessionId: 'session-1',
  requestContext: {},
};

export const validStreamEventPlan = {
  type: 'plan',
  payload: {
    reasoning: 'La consulta pide historial sancionador; combinaré datos de la API con resoluciones.',
    tasks: [validDomainTaskPacket],
  },
};

export const validStreamEventResult = {
  type: 'result',
  payload: {
    text: 'Se encontraron 8 sanciones firmes.',
    uiActions: [{ action: 'open_tab', tab: 'datos' }],
    evidence: [validEvidenceItem],
  },
};

export const validStreamEventDone = {
  type: 'done',
  payload: { sessionId: 'session-1', status: 'completed' },
};
