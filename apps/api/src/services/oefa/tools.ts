import { OefaDatasetConfig, OefaQueryResult, OefaRecord, ResolutionStatus } from '@agentops/shared';
import { z } from 'zod';
import { defineTool, type ToolDescriptor } from '../tools/types.js';
import { OEFA_DATASETS, type OefaDatasetKey } from './datasets.js';
import type { OefaService } from './oefa-service.js';

const datasetKeySchema = z
  .enum(Object.keys(OEFA_DATASETS) as [OefaDatasetKey, ...OefaDatasetKey[]])
  .describe('Clave del dataset OEFA (p. ej. resolucionesMultaFirmes)');

const filterSchema = z.object({
  administrado: z.string().optional(),
  ruc: z.string().optional(),
  sector: z.string().optional(),
  region: z.string().optional(),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  status: ResolutionStatus.optional(),
  infraction: z.string().optional(),
});

const entityCandidateSchema = z.object({
  administrado: z.string(),
  ruc: z.string().optional(),
  sector: z.string().optional(),
  recordCount: z.number().int(),
});

const companyProfileResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    profile: z.object({
      entity: z.object({ administrado: z.string(), ruc: z.string().optional() }),
      records: z.array(OefaRecord),
      stats: z.object({
        totalRecords: z.number().int(),
        withSanction: z.number().int(),
        sumFineUit: z.number(),
        sumFineSoles: z.number(),
        firmCount: z.number().int(),
        openCount: z.number().int(),
        reincidencia: z.boolean(),
        sectors: z.array(z.string()),
        byYear: z.record(z.number().int()),
      }),
      dataAsOf: z.string(),
      fromCache: z.boolean(),
      coverage: z.string().optional(),
    }),
  }),
  z.object({ status: z.literal('ambiguous'), candidates: z.array(entityCandidateSchema) }),
  z.object({ status: z.literal('not_found'), query: z.string() }),
]);

/**
 * OEFA tools (DataAgent's toolset). Returned as plain descriptors bound to an
 * `OefaService`; Phase 2 wraps them as Mastra tools.
 */
export function createOefaTools(service: OefaService): ToolDescriptor[] {
  const listDatasets = defineTool({
    id: 'list_oefa_datasets',
    description: 'Lista los datasets OEFA disponibles (con su GUID, tipo y descripción).',
    inputSchema: z.object({}),
    outputSchema: z.array(OefaDatasetConfig),
    execute: async () => Object.values(OEFA_DATASETS),
  });

  const fetchDataset = defineTool({
    id: 'fetch_oefa_dataset',
    description:
      'Obtiene los registros normalizados de un dataset OEFA, con respaldo en caché si la API falla.',
    inputSchema: z.object({ datasetKey: datasetKeySchema, maxRows: z.number().int().positive().optional() }),
    outputSchema: OefaQueryResult,
    execute: ({ datasetKey, maxRows }) => service.getRecords(datasetKey, { maxRows }),
  });

  const searchRecords = defineTool({
    id: 'search_oefa_records',
    description:
      'Busca registros OEFA por administrado, RUC, sector, región, rango de años, estado o infracción.',
    inputSchema: filterSchema.extend({ datasetKey: datasetKeySchema.optional() }),
    outputSchema: OefaQueryResult,
    execute: ({ datasetKey, ...filter }) => service.searchRecords(filter, datasetKey),
  });

  const companyProfile = defineTool({
    id: 'get_company_oefa_profile',
    description:
      'Resuelve un administrado por RUC o nombre y devuelve su perfil (registros + estadísticas). ' +
      'Si el nombre es ambiguo, devuelve candidatos para que el usuario elija (no adivina).',
    inputSchema: z.object({ query: z.string().min(1), datasetKey: datasetKeySchema.optional() }),
    outputSchema: companyProfileResultSchema,
    execute: ({ query, datasetKey }) => service.getCompanyProfile(query, datasetKey),
  });

  return [listDatasets, fetchDataset, searchRecords, companyProfile];
}
