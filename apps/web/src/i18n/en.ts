import type { MessageKey } from './es.js';

/** English UI catalog. Typed as `Record<MessageKey, string>` → every Spanish key
 *  must have a translation here (a missing one fails the build). */
export const en: Record<MessageKey, string> = {
  // App shell / nav
  'nav.panel': 'Dashboard',
  'nav.oefa': 'OEFA Explorer',
  'nav.documentos': 'Documents',
  'app.title': 'AgentOps Debugger',
  'app.subtitle': 'OEFA · Environmental compliance',
  'app.mode': '{mode} mode',
  'app.reports': 'Reports',
  'lang.label': 'Language',
  'lang.es': 'Español',
  'lang.en': 'English',

  // Dashboard
  'dash.title': 'Dashboard',
  'dash.new': 'New investigation',
  'dash.recent': 'Recent investigations',
  'dash.loading': 'Loading…',
  'dash.empty': 'No investigations yet. Start one with “New investigation”.',
  'dash.turns': '{n} turn(s) · {date}',
  'dash.kpi.open': 'Open proceedings',
  'dash.kpi.newResolutions': 'New resolutions (month)',
  'dash.kpi.exposure': 'Portfolio exposure (UIT)',
  'dash.kpi.alerts': 'Active alerts',

  // Workspace
  'workspace.header': 'Investigation · {id}',
  'workspace.trace': 'Traceability',
  'workspace.traceTitle': 'How was this answer built?',
  'workspace.emptyHeading': 'What would you like to investigate?',
  'workspace.emptyDesc':
    'Ask in natural language about regulated entities, sanctions and OEFA resolutions.',
  'workspace.loadingSession': 'Loading session…',
  'workspace.send': 'Send',
  'workspace.inputAria': 'Query',
  'workspace.placeholder.approval': 'Use the approval buttons above…',
  'workspace.placeholder.clarification': 'Answer the clarification…',
  'workspace.placeholder.default': 'Type your query…',
  'workspace.suggestion1': 'Generate a background report for RUC 20543210981',
  'workspace.suggestion2': 'Background of the regulated entity with RUC 20543210981',
  'workspace.suggestion3': 'What sanctions does bambas have?',

  // Status labels
  'status.idle': 'Ready',
  'status.running': 'Investigating…',
  'status.waiting': 'Waiting for your reply',
  'status.completed': 'Completed',
  'status.failed': 'With errors',

  // Chat
  'chat.clarification': 'Clarification',
  'chat.approvalRequired': 'Approval required',
  'chat.approve': 'Approve and save report',
  'chat.cancel': 'Cancel',
  'chat.summary': 'Summary',
  'chat.sources': 'Sources:',
  'chat.plan': 'Plan',
  'chat.planCount': '{settled} of {total}',
  'chat.ariaErrors': 'with errors',
  'chat.ariaDone': 'completed',
  'chat.errNoBody': 'Empty response body.',
  'chat.errNetwork': 'Network error. Check your connection and try again.',

  // Evidence
  'evidence.title': 'Evidence',
  'evidence.noSource': 'no source',
  'evidence.document': 'Document',
  'evidence.resolution': 'Resolution',
  'evidence.page': 'Page',
  'evidence.date': 'Date',
  'evidence.confidence': 'Confidence',
  'evidence.openOriginal': 'Open original document',
  'evidence.openOriginalPage': 'Open original document (p. {page})',
  'evidence.showOriginal': 'show original',
  'evidence.showTranslation': 'show translation',
  'evidence.originalTag': 'original ({lang})',

  // Canvas tabs + empty states
  'tab.resumen': 'Summary',
  'tab.datos': 'OEFA Data',
  'tab.documentos': 'Documents',
  'tab.informe': 'Report',
  'canvas.empty.default': 'The panel will fill with the evidence from your investigation.',
  'canvas.empty.datos': 'No data for this session yet.',
  'canvas.empty.documentos': 'No documents retrieved yet.',
  'canvas.empty.reportPending': 'The structured report will be generated after approval (HITL).',
  'canvas.empty.reportLoading': 'Loading report…',
  'canvas.empty.reportError': 'The report could not be loaded.',

  // Report
  'report.approved': 'Approved',
  'report.draft': 'Draft',
  'report.export': 'Export:',
  'report.execSummary': 'Executive summary',
  'report.riskLevel': 'Risk level:',
  'report.findings': 'Findings',
  'report.warnings': 'Warnings',
  'report.recommendations': 'Recommendations',
  'report.rationale': 'Rationale:',
  'report.sourcesAnnex': 'Sources and methodology annex',
  'report.consulted': 'Consulted:',
  'report.issued': 'issued {date}',

  // Charts
  'chart.coverage': 'coverage {coverage}',
  'chart.consulted': 'as of {date}',

  // Trace
  'trace.title': 'Traceability',
  'trace.loading': 'Loading trace…',
  'trace.empty': 'No trace for this session yet.',
  'trace.verification': 'Verification',
  'trace.noDrops': 'No claims were dropped for lack of evidence.',
  'trace.drops': '{n} claim(s) dropped by the evidence guardrail.',
  'trace.event.turn_opened': 'Turn opened',
  'trace.event.plan_created': 'Plan created',
  'trace.event.task_routed': 'Task routed',
  'trace.event.task_started': 'Task started',
  'trace.event.tool_called': 'Tool called',
  'trace.event.llm_call': 'Model call',
  'trace.event.evidence_attached': 'Evidence attached',
  'trace.event.guardrail_drop': 'Claim dropped (no evidence)',
  'trace.event.clarification_required': 'Clarification requested',
  'trace.event.approval_required': 'Approval required',
  'trace.event.approval_granted': 'Approval granted',
  'trace.event.task_done': 'Task completed',
  'trace.event.report_saved': 'Report saved',
  'trace.event.warning': 'Warning',
  'trace.event.error': 'Error',

  // UI primitives
  'ui.close': 'Close',
};
