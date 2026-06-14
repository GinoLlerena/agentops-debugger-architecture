/**
 * Punto de entrada de los datos semilla offline de la OEFA (RUIAS + corpus
 * documental). Reexporta los registros, la tabla de UIT y las utilidades de
 * conversión, y expone las rutas del corpus documental precargado.
 */
export { RUIAS_SEED } from './records/ruias-seed.js';
export { UIT_BY_YEAR, uitToSoles, solesToUit } from './uit-by-year.js';

/**
 * Rutas (relativas a este directorio) de los documentos Markdown precargados
 * que conforman el corpus para recuperación (RAG).
 */
export const SEED_DOC_PATHS: string[] = [
  'docs/resolucion-dfai-1245-2023.md',
  'docs/resolucion-tfa-0456-2024.md',
  'docs/informe-supervision-2023.md',
  'docs/guia-transparencia-oefa.md',
];
