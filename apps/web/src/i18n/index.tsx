import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE, Language } from '@agentops/shared';
import { es, type MessageKey } from './es.js';
import { en } from './en.js';

/**
 * Lightweight, dependency-free i18n. A typed catalog per language + a context
 * hook. `t(key, params?)` looks up the active catalog and interpolates `{name}`
 * placeholders. The language preference persists to localStorage and is the
 * single source the app reads (and sends to the API on each request).
 */

const CATALOGS: Record<Language, Record<MessageKey, string>> = { es, en };
const STORAGE_KEY = 'agentops.lang';
/** BCP-47 locales for Intl number/date formatting per app language. */
const LOCALES: Record<Language, string> = { es: 'es-PE', en: 'en-US' };

export type TParams = Record<string, string | number>;

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

function readStoredLanguage(): Language {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE;
  const parsed = Language.safeParse(localStorage.getItem(STORAGE_KEY));
  return parsed.success ? parsed.data : DEFAULT_LANGUAGE;
}

interface I18nContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: TParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const catalog = CATALOGS[language];
    return {
      language,
      locale: LOCALES[language],
      setLanguage,
      t: (key, params) => interpolate(catalog[key] ?? key, params),
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}

/** Just the BCP-47 locale for the active language (number/date formatting). */
export function useLocale(): string {
  return useI18n().locale;
}

export type { MessageKey };
