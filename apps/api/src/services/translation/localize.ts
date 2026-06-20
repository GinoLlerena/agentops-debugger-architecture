import { DEFAULT_LANGUAGE, type EvidenceItem, type Language } from '@agentops/shared';
import type { Translator } from './types.js';

/**
 * Outbound citation localization (response edge). Translates each evidence item's
 * `documentTitle`/`passage` into `language` while preserving the Spanish source in
 * the `*Original` sidecars (+ `originalLanguage`) — this is what powers the
 * "show original" toggle. Source language ('es') is a no-op. Offline
 * (NoopTranslator) returns the text unchanged, so no sidecars are set and
 * citations stay in Spanish. Idempotent: an already-localized item is left as is.
 */
export async function localizeEvidence(
  evidence: EvidenceItem[],
  language: Language,
  translator: Translator,
): Promise<EvidenceItem[]> {
  if (language === DEFAULT_LANGUAGE) return evidence;
  return Promise.all(evidence.map((e) => localizeOne(e, language, translator)));
}

async function localizeOne(
  e: EvidenceItem,
  language: Language,
  translator: Translator,
): Promise<EvidenceItem> {
  if (e.originalLanguage) return e; // already localized — keep faithful
  const opts = { from: DEFAULT_LANGUAGE, to: language } as const;
  const [title, passage] = await Promise.all([
    translator.translate(e.documentTitle, opts),
    translator.translate(e.passage, opts),
  ]);
  const titleChanged = title !== e.documentTitle;
  const passageChanged = passage !== e.passage;
  // Nothing actually translated (offline Noop, or pure proper-noun text) → leave
  // the item untouched so there's no spurious "show original".
  if (!titleChanged && !passageChanged) return e;
  return {
    ...e,
    documentTitle: title,
    passage,
    ...(titleChanged ? { documentTitleOriginal: e.documentTitle } : {}),
    ...(passageChanged ? { passageOriginal: e.passage } : {}),
    originalLanguage: DEFAULT_LANGUAGE,
  };
}

/**
 * Inbound query localization (retrieval edge). Translates a user query written in
 * `language` into canonical Spanish so BM25/RAG + entity resolution run over the
 * Spanish corpus. Source language is a no-op; offline returns the query unchanged.
 * Entity names the user picked (a clarification answer) must NOT be passed here.
 */
export async function translateQuery(
  query: string,
  language: Language,
  translator: Translator,
): Promise<string> {
  if (language === DEFAULT_LANGUAGE || !query.trim()) return query;
  return translator.translate(query, { from: language, to: DEFAULT_LANGUAGE });
}
