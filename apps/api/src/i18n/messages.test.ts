import { describe, expect, it } from 'vitest';
import { messages } from './messages.js';

describe('messages', () => {
  it('returns the Spanish catalog by default and for es', () => {
    expect(messages().noEvidence).toBe('No encontré evidencia en las fuentes consultadas.');
    expect(messages('es').reasoningQa).toContain('historial de cumplimiento');
  });

  it('returns the English catalog for en', () => {
    expect(messages('en').noEvidence).toBe('No evidence found in the sources consulted.');
    expect(messages('en').chartFinesByYear).toBe('How much do fines add up to per year?');
  });

  it('interpolates templated entries per language', () => {
    expect(messages('es').dataSummary({ total: 3, administrado: 'X', firm: 2 })).toBe(
      '3 registros de X (2 firmes).',
    );
    expect(messages('en').dataSummary({ total: 3, administrado: 'X', firm: 2 })).toBe(
      '3 records for X (2 final).',
    );
    expect(messages('en').warningOpen(2)).toContain('non-final resolution');
  });
});
