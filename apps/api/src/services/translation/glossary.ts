import type { Language } from '@agentops/shared';

/**
 * OEFA / environmental-compliance termbase. Pinning these renderings keeps
 * citations and narrative consistent across turns and between the
 * offline catalog (i18n/messages.ts) and live translation. Terms not listed are
 * translated freely by the model; proper nouns / RUC / resolution codes are
 * never translated (enforced by the prompt rules, not this list).
 */
export const LEGAL_GLOSSARY: ReadonlyArray<{ es: string; en: string }> = [
  { es: 'OEFA', en: 'OEFA' },
  { es: 'administrado', en: 'regulated entity' },
  { es: 'fiscalización ambiental', en: 'environmental oversight' },
  { es: 'multa', en: 'fine' },
  { es: 'sanción', en: 'sanction' },
  { es: 'sanción firme', en: 'final sanction' },
  { es: 'resolución', en: 'resolution' },
  { es: 'resolución directoral', en: 'directoral resolution' },
  { es: 'reincidencia', en: 'repeat offense' },
  { es: 'hechos imputados', en: 'alleged facts' },
  { es: 'medida cautelar', en: 'precautionary measure' },
  { es: 'medida correctiva', en: 'corrective measure' },
  { es: 'considerando', en: 'recital' },
  { es: 'apelada', en: 'under appeal' },
  { es: 'UIT', en: 'UIT' },
];

/** A one-line glossary directive for the translation prompt, in the target language. */
export function glossaryDirective(to: Language): string {
  const pairs = LEGAL_GLOSSARY.map((g) => (to === 'en' ? `${g.es} → ${g.en}` : `${g.en} → ${g.es}`));
  return pairs.join('; ');
}
