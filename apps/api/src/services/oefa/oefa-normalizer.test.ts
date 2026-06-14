import { describe, expect, it } from 'vitest';
import { OefaRecord } from '@agentops/shared';
import { getDataset } from './datasets.js';
import { normalizeResolutionStatus, normalizeRows, normalizeRowsSafe } from './oefa-normalizer.js';
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

  it('does NOT classify a negated status ("no firme") as firme', () => {
    expect(normalizeResolutionStatus('No firme')).not.toBe('firme');
    expect(normalizeResolutionStatus('Aún no firme')).not.toBe('firme');
    expect(normalizeResolutionStatus('Apelada, no firme')).toBe('apelada');
  });
});

describe('normalizeRowsSafe robustness', () => {
  const dataset2 = getDataset('resolucionesMultaFirmes');
  const opts = { fetchedAt: '2026-06-13T12:00:00.000Z' };

  it('skips a malformed row (negative fine) instead of aborting the whole batch', () => {
    const rows = [
      { Administrado: 'Empresa Buena S.A.', 'Multa (UIT)': '100', Estado: 'Firme' },
      { Administrado: 'Empresa Mala S.A.', 'Multa (UIT)': '-50', Estado: 'Firme' }, // negative → rejected
      { Administrado: 'Empresa Otra S.A.', 'Multa (UIT)': '30', Estado: 'Firme' },
    ];
    const { records, skipped } = normalizeRowsSafe(rows, dataset2, opts);
    expect(records).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(records.map((r) => r.administrado)).toEqual(['Empresa Buena S.A.', 'Empresa Otra S.A.']);
  });

  it('parses a comma-decimal fine without inflating it 10x', () => {
    const { records } = normalizeRowsSafe(
      [{ Administrado: 'X', 'Multa (UIT)': '12,5', Estado: 'Firme' }],
      dataset2,
      opts,
    );
    expect(records[0]!.fineAmountUit).toBe(12.5);
  });

  it('maps array-of-arrays rows when columns are threaded', () => {
    const { records } = normalizeRowsSafe(
      [['20100110663', 'Refinería La Pampilla S.A.A.', 'Firme']],
      dataset2,
      { ...opts, columns: ['RUC', 'Administrado', 'Estado'] },
    );
    expect(records[0]!.administrado).toBe('Refinería La Pampilla S.A.A.');
    expect(records[0]!.ruc).toBe('20100110663');
  });
});
