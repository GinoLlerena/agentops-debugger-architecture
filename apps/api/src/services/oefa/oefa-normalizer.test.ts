import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { getDataset } from './datasets.js';
import { normalizeResolutionStatus, normalizeRows } from './oefa-normalizer.js';
import fixture from './__fixtures__/junar-resoluciones.json' with { type: 'json' };

const dataset = getDataset('resolucionesMultaFirmes');

describe('oefa normalizer', () => {
  const records = normalizeRows(fixture.result, dataset, {
    fetchedAt: '2026-06-13T12:00:00.000Z',
    coverage: '2019-2025',
  });

  it('maps every fixture row to a schema-valid OefaRecord', () => {
    expect(records).toHaveLength(3);
    for (const r of records) expect(OefaRecord.safeParse(r).success).toBe(true);
  });

  it('reads accented / spaced column names via alias matching', () => {
    const first = records[0]!;
    expect(first.administrado).toBe('Refinería La Pampilla S.A.A.');
    expect(first.ruc).toBe('20100110663');
    expect(first.unidadFiscalizable).toBe('Refinería La Pampilla');
    expect(first.normativaIncumplida).toBe('D.S. 003-2010-MINAM');
    expect(first.resolucionMulta).toBe('Resolución N.° 1245-2023-OEFA/DFAI');
    expect(first.location?.departamento).toBe('Callao');
  });

  it('parses numbers with thousands separators', () => {
    expect(records[0]!.fineAmountUit).toBe(320);
    expect(records[0]!.fineAmountSoles).toBe(1_584_000);
  });

  it('parses booleans and maps resolution status to the enum', () => {
    expect(records[0]!.reincidencia).toBe(true);
    expect(records[0]!.resolutionStatus).toBe('firme');
    expect(records[1]!.reincidencia).toBe(false);
    expect(records[1]!.resolutionStatus).toBe('apelada'); // "En apelación"
  });

  it('builds a stable id from the dataset guid', () => {
    expect(records[0]!.id.startsWith(`${dataset.guid}:`)).toBe(true);
  });

  it('normalizeResolutionStatus handles synonyms and unknowns', () => {
    expect(normalizeResolutionStatus('Consentida')).toBe('firme');
    expect(normalizeResolutionStatus('En trámite')).toBe('en_proceso');
    expect(normalizeResolutionStatus('Archivado')).toBe('archivada');
    expect(normalizeResolutionStatus('cualquier cosa')).toBe('desconocido');
    expect(normalizeResolutionStatus(undefined)).toBe('desconocido');
  });
});
