import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { es } from './es.js';
import { en } from './en.js';
import { I18nProvider, useI18n } from './index.js';

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => localStorage.clear());

describe('catalogs', () => {
  it('en and es expose exactly the same keys (no missing/extra translation)', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});

describe('useI18n', () => {
  it('defaults to Spanish and translates a key', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.language).toBe('es');
    expect(result.current.t('workspace.send')).toBe('Enviar');
    expect(result.current.locale).toBe('es-PE');
  });

  it('interpolates {placeholders}', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t('chat.planCount', { settled: 2, total: 3 })).toBe('2 de 3');
  });

  it('switches language (and reflects in t + locale) and persists to localStorage', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLanguage('en'));
    expect(result.current.t('workspace.send')).toBe('Send');
    expect(result.current.locale).toBe('en-US');
    expect(localStorage.getItem('agentops.lang')).toBe('en');
  });

  it('restores the persisted language on mount', () => {
    localStorage.setItem('agentops.lang', 'en');
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.language).toBe('en');
  });
});
