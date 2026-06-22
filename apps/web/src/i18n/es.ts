/**
 * Spanish (es-PE) UI catalog — the canonical key set. `en.ts` is typed against
 * `MessageKey`, so a missing translation is a compile error, not a blank string.
 * Keys are flat and dotted by area. `{name}` placeholders are interpolated by `t`.
 *
 * Scope: UI chrome only. Agent-generated narrative, report content and citations
 * are localized on the backend (see the i18n plan, PR2/PR3).
 */
export const es = {
  // App shell / nav
  'nav.panel': 'Panel',
  'nav.oefa': 'Explorador OEFA',
  'nav.documentos': 'Documentos',
  'app.title': 'AgentOps Debugger',
  'app.subtitle': 'OEFA · Cumplimiento ambiental',
  'app.mode': 'modo {mode}',
  'app.reports': 'Informes',
  'lang.label': 'Idioma',
  'lang.es': 'Español',
  'lang.en': 'English',

  // Dashboard
  'dash.title': 'Panel',
  'dash.new': 'Nueva investigación',
  'dash.recent': 'Investigaciones recientes',
  'dash.loading': 'Cargando…',
  'dash.empty': 'Aún no hay investigaciones. Inicia una con “Nueva investigación”.',
  'dash.turns': '{n} turno(s) · {date}',
  'dash.kpi.open': 'Procesos abiertos',
  'dash.kpi.newResolutions': 'Nuevas resoluciones (mes)',
  'dash.kpi.exposure': 'Exposición cartera (UIT)',
  'dash.kpi.alerts': 'Alertas activas',

  // Workspace
  'workspace.header': 'Investigación · {id}',
  'workspace.trace': 'Trazabilidad',
  'workspace.traceTitle': '¿Cómo se construyó esta respuesta?',
  'workspace.emptyHeading': '¿Qué deseas investigar?',
  'workspace.emptyDesc':
    'Pregunta en lenguaje natural sobre administrados, sanciones y resoluciones de OEFA.',
  'workspace.loadingSession': 'Cargando sesión…',
  'workspace.send': 'Enviar',
  'workspace.inputAria': 'Consulta',
  'workspace.placeholder.approval': 'Usa los botones de aprobación arriba…',
  'workspace.placeholder.clarification': 'Responde la aclaración…',
  'workspace.placeholder.default': 'Escribe tu consulta…',
  'workspace.suggestion1': 'Genera un informe de antecedentes del RUC 20543210981',
  'workspace.suggestion2': 'Antecedentes del administrado con RUC 20543210981',
  'workspace.suggestion3': '¿Qué sanciones tiene bambas?',

  // Status labels
  'status.idle': 'Lista',
  'status.running': 'Investigando…',
  'status.waiting': 'Esperando tu respuesta',
  'status.completed': 'Completado',
  'status.failed': 'Con errores',

  // Chat
  'chat.clarification': 'Aclaración',
  'chat.approvalRequired': 'Aprobación requerida',
  'chat.approve': 'Aprobar y guardar informe',
  'chat.cancel': 'Cancelar',
  'chat.summary': 'Resumen',
  'chat.sources': 'Fuentes:',
  'chat.plan': 'Plan',
  'chat.planCount': '{settled} de {total}',
  'chat.ariaErrors': 'con errores',
  'chat.ariaDone': 'completado',

  // Evidence
  'evidence.title': 'Evidencia',
  'evidence.noSource': 'sin fuente',
  'evidence.document': 'Documento',
  'evidence.resolution': 'Resolución',
  'evidence.page': 'Página',
  'evidence.date': 'Fecha',
  'evidence.confidence': 'Confianza',
  'evidence.openOriginal': 'Abrir documento original',
  'evidence.openOriginalPage': 'Abrir documento original (p. {page})',
  'evidence.showOriginal': 'ver original',
  'evidence.showTranslation': 'ver traducción',
  'evidence.originalTag': 'original ({lang})',

  // Canvas tabs + empty states
  'tab.resumen': 'Resumen',
  'tab.datos': 'Datos OEFA',
  'tab.documentos': 'Documentos',
  'tab.informe': 'Informe',
  'canvas.empty.default': 'El panel se irá llenando con la evidencia de tu investigación.',
  'canvas.empty.datos': 'Sin datos para esta sesión todavía.',
  'canvas.empty.documentos': 'Sin documentos recuperados todavía.',
  'canvas.empty.reportPending': 'El informe estructurado se generará tras la aprobación (HITL).',
  'canvas.empty.reportLoading': 'Cargando informe…',
  'canvas.empty.reportError': 'No se pudo cargar el informe.',

  // Report
  'report.approved': 'Aprobado',
  'report.draft': 'Borrador',
  'report.export': 'Exportar:',
  'report.execSummary': 'Resumen ejecutivo',
  'report.riskLevel': 'Nivel de riesgo:',
  'report.findings': 'Hallazgos',
  'report.warnings': 'Advertencias',
  'report.recommendations': 'Recomendaciones',
  'report.rationale': 'Fundamento:',
  'report.sourcesAnnex': 'Anexo de fuentes y metodología',
  'report.consulted': 'Consultado:',
  'report.issued': 'emitido {date}',

  // Charts
  'chart.coverage': 'cobertura {coverage}',
  'chart.consulted': 'consultado {date}',

  // Trace
  'trace.title': 'Trazabilidad',
  'trace.loading': 'Cargando traza…',
  'trace.empty': 'Aún no hay traza para esta sesión.',
  'trace.verification': 'Verificación',
  'trace.noDrops': 'No se descartaron afirmaciones por falta de evidencia.',
  'trace.drops': '{n} afirmación(es) descartada(s) por el guardrail de evidencia.',
  'trace.event.turn_opened': 'Turno iniciado',
  'trace.event.plan_created': 'Plan creado',
  'trace.event.task_routed': 'Tarea asignada',
  'trace.event.task_started': 'Tarea iniciada',
  'trace.event.tool_called': 'Herramienta invocada',
  'trace.event.llm_call': 'Llamada al modelo',
  'trace.event.evidence_attached': 'Evidencia adjuntada',
  'trace.event.guardrail_drop': 'Afirmación descartada (sin evidencia)',
  'trace.event.clarification_required': 'Aclaración solicitada',
  'trace.event.approval_required': 'Aprobación requerida',
  'trace.event.approval_granted': 'Aprobación otorgada',
  'trace.event.task_done': 'Tarea completada',
  'trace.event.report_saved': 'Informe guardado',
  'trace.event.warning': 'Advertencia',
  'trace.event.error': 'Error',

  // UI primitives
  'ui.close': 'Cerrar',
} as const;

export type MessageKey = keyof typeof es;
