import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_LABELS,
  ConfidenceLabel,
  DEFAULT_LANGUAGE,
  Language,
  NormalizedUserRequest,
  RESOLUTION_STATUS_LABELS,
  ResolutionStatus,
  RISK_SEVERITY_LABELS,
  RiskSeverity,
  WARNING_SEVERITY_LABELS,
  WarningSeverity,
  localizeLabel,
} from '../index.js';

describe('Language', () => {
  it('defaults requests to the canonical Spanish language', () => {
    expect(DEFAULT_LANGUAGE).toBe('es');
    const req = NormalizedUserRequest.parse({ text: 'hola' });
    expect(req.language).toBe('es');
  });

  it('accepts an explicit language', () => {
    expect(NormalizedUserRequest.parse({ text: 'hi', language: 'en' }).language).toBe('en');
  });
});

describe('label maps cover every enum value in every language', () => {
  const cases: [Record<string, Record<'es' | 'en', string>>, readonly string[]][] = [
    [CONFIDENCE_LABELS, ConfidenceLabel.options],
    [WARNING_SEVERITY_LABELS, WarningSeverity.options],
    [RISK_SEVERITY_LABELS, RiskSeverity.options],
    [RESOLUTION_STATUS_LABELS, ResolutionStatus.options],
  ];
  for (const [map, values] of cases) {
    for (const value of values) {
      for (const lang of Language.options) {
        it(`${value} → ${lang}`, () => {
          expect(map[value]?.[lang]).toBeTruthy();
        });
      }
    }
  }
});

describe('localizeLabel', () => {
  it('renders the requested language and falls back to the raw value when unmapped', () => {
    expect(localizeLabel(CONFIDENCE_LABELS, 'directa', 'en')).toBe('Direct evidence');
    expect(localizeLabel(CONFIDENCE_LABELS, 'directa', 'es')).toBe('Evidencia directa');
    expect(localizeLabel(CONFIDENCE_LABELS, 'unmapped', 'en')).toBe('unmapped');
  });
});
