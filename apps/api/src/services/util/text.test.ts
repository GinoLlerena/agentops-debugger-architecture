import { describe, expect, it } from 'vitest';
import { canonKey, foldAccents, normalizeText, parseLocaleNumber } from './text.js';

describe('foldAccents / normalizeText / canonKey', () => {
  it('folds accents and lowercases', () => {
    expect(foldAccents('Refinería La Pampilla')).toBe('refineria la pampilla');
  });
  it('collapses whitespace in normalizeText', () => {
    expect(normalizeText('  Minera   Los   Andes ')).toBe('minera los andes');
  });
  it('canonicalizes keys to underscore form', () => {
    expect(canonKey('Multa (UIT)')).toBe('multa_uit');
    expect(canonKey('Resolución de Multa')).toBe('resolucion_de_multa');
  });
});

describe('parseLocaleNumber', () => {
  it('treats commas as thousands separators when not decimal-shaped', () => {
    expect(parseLocaleNumber('1,584,000')).toBe(1_584_000);
    expect(parseLocaleNumber('S/ 690,000')).toBe(690_000);
  });
  it('treats a single 1-2 digit comma group as a decimal (es-PE)', () => {
    expect(parseLocaleNumber('12,5')).toBe(12.5);
    expect(parseLocaleNumber('0,75')).toBe(0.75);
  });
  it('handles both separators, last one is the decimal', () => {
    expect(parseLocaleNumber('1.584.000,50')).toBe(1_584_000.5);
    expect(parseLocaleNumber('1,584,000.50')).toBe(1_584_000.5);
  });
  it('parses dot-only and plain integers', () => {
    expect(parseLocaleNumber('320')).toBe(320);
    expect(parseLocaleNumber('12.5')).toBe(12.5);
  });
  it('returns undefined for non-numeric input', () => {
    expect(parseLocaleNumber('N/A')).toBeUndefined();
    expect(parseLocaleNumber('-')).toBeUndefined();
  });
});
