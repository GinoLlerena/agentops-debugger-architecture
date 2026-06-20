import { generateText } from 'ai';
import type { Language } from '@agentops/shared';
import type { QwenProvider } from '../qwen/qwen-provider.js';
import { glossaryDirective } from './glossary.js';
import type { TranslateOptions, Translator } from './types.js';

const LANGUAGE_NAMES: Record<Language, string> = { es: 'Spanish', en: 'English' };

/**
 * Live translator backed by Qwen Cloud (DashScope). Used at the i18n edges:
 * inbound (user query → Spanish for retrieval) and outbound (citations →
 * requested language). Wrap in {@link CachedTranslator} so repeated passages cost
 * one call. Heavy/per-request, so always check {@link Translator.translate}'s
 * same-language fast path first.
 *
 * Glossary-aware and instructed to keep proper nouns, company names and
 * RUC/resolution codes verbatim — a citation must stay faithful to its source.
 */
export class QwenTranslator implements Translator {
  constructor(private readonly qwen: QwenProvider) {}

  async translate(text: string, { from, to }: TranslateOptions): Promise<string> {
    if (from === to || !text.trim()) return text;
    const system =
      `You are a professional legal/technical translator for Peruvian environmental ` +
      `compliance (OEFA). Translate from ${LANGUAGE_NAMES[from]} to ${LANGUAGE_NAMES[to]}. ` +
      `Rules: translate faithfully and concisely; do NOT add notes or quotes; ` +
      `NEVER translate proper nouns, company names (administrado), people's names, ` +
      `RUC numbers, or resolution codes (e.g. "Resolución N.° 1245-2023-OEFA/DFAI") — ` +
      `keep them verbatim. Preserve numbers, dates and units (UIT, S/) exactly. ` +
      `Use this terminology: ${glossaryDirective(to)}. ` +
      `Return ONLY the translated text.`;
    const { text: out } = await generateText({
      model: this.qwen.getChatModel(),
      system,
      prompt: text,
      maxOutputTokens: 1024,
    });
    return out.trim() || text;
  }
}
