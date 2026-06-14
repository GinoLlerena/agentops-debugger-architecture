import type { OefaDatasetConfig } from '@agentops/shared';

/**
 * Verified OEFA Datos Abiertos datasets (Junar platform). GUIDs confirmed
 * against the live portal on 13/06/2026 — see `docs/files/oefa-api-verification.md`.
 *
 * `datastream` = row-level data (preferred for report evidence).
 * `dashboard`  = a container of views (consume the underlying datastreams for rows).
 */
export const OEFA_DATASETS = {
  supervisionesConcluidas: {
    id: 'supervisiones-concluidas',
    guid: 'INFOR-ELABO',
    type: 'dashboard',
    description: 'Supervisiones concluidas (planificación, ejecución y resultados)',
  },
  resolucionesMultaFirmes: {
    id: 'resoluciones-multa-firmes',
    guid: 'RESOL-CON-MULTA-FIRME',
    type: 'datastream',
    description: 'Resoluciones con multa firmes 2019-2025 (núcleo del informe)',
  },
  registroActosAdministrativos: {
    id: 'registro-actos-administrativos',
    guid: 'REGIS-ACTOS-ADMIN-96376',
    type: 'datastream',
    description: 'Registro de actos administrativos 2021-2025 (responsabilidad, sanciones, medidas)',
  },
  medidasAdministrativasSupervision: {
    id: 'medidas-administrativas-supervision',
    guid: 'MEDID-ADMIN-DE-LAS-DIREC',
    type: 'datastream',
    description: 'Medidas administrativas de las direcciones de supervisión 2016-2025',
  },
  informesSupervision: {
    id: 'informes-supervision',
    guid: 'INFOR-DE-LA-DIREC-28304',
    type: 'datastream',
    description: 'Informes de la Dirección de Supervisión 2019-2025',
  },
  expedientesResueltos: {
    id: 'expedientes-resueltos',
    guid: 'EXPED-RESUE-15640',
    type: 'datastream',
    description: 'Expedientes resueltos 2021-2025 (análisis de precedentes)',
  },
} as const satisfies Record<string, OefaDatasetConfig>;

export type OefaDatasetKey = keyof typeof OEFA_DATASETS;

/** Dataset coverage windows shown in the "datos al / cobertura" stamp (UX §6.2). */
export const DATASET_COVERAGE: Record<OefaDatasetKey, string> = {
  supervisionesConcluidas: '2016-2025',
  resolucionesMultaFirmes: '2019-2025',
  registroActosAdministrativos: '2021-2025',
  medidasAdministrativasSupervision: '2016-2025',
  informesSupervision: '2019-2025',
  expedientesResueltos: '2021-2025',
};

export function getDataset(key: OefaDatasetKey): OefaDatasetConfig {
  return OEFA_DATASETS[key];
}

export function findDatasetByGuid(guid: string): OefaDatasetConfig | undefined {
  return Object.values(OEFA_DATASETS).find((d) => d.guid === guid);
}
