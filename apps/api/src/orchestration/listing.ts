import type { DomainTaskPacket, DomainTaskResult, Language } from '@agentops/shared';
import { distinctEntities, type OefaService } from '../services/oefa/oefa-service.js';
import { foldAccents } from '../services/util/text.js';
import { messages } from '../i18n/messages.js';

/**
 * Listing intent: "lístame las entidades sancionadas este año" / "list the
 * sanctioned companies". Instead of resolving ONE administrado (the normal
 * entity-centric flow), the Data agent answers with the existing clarification
 * card — every entity is a clickable candidate, and picking one resumes the
 * standard antecedentes cycle. Detection and the query itself are deterministic
 * (no LLM call), so live and offline behave identically and the live model's
 * output variance cannot break the listing.
 */

export interface ListingIntent {
  yearFrom?: number;
  yearTo?: number;
}

/** Candidates shown on the listing card; sorted by record count, capped so the
 *  card stays scannable. The question notes when the list was capped. */
export const MAX_LISTING_CANDIDATES = 12;

// All three must match (verb + plural entity noun + sanction stem) so entity
// queries ("¿Qué sanciones tiene bambas?") and report requests never trip it.
const LISTING_VERB =
  /\b(listame|lista|listado|enumera|enumerar|muestrame|muestra|cuales son|dame|list|show|enumerate|which|what)\b/;
const PLURAL_ENTITY = /\b(entidades|empresas|administrados|companias|companies|entities|firms)\b/;
const SANCTION = /\b(sancionad\w*|sancion(es)?|multad\w*|multas?|sanctioned|sanctions?|fined|fines?|penalized|penalt\w*)\b/;

/** Detect a listing question and its year range. Returns undefined for the
 *  normal entity-centric flow. An 11-digit RUC always means a specific entity. */
export function detectListingIntent(question: string, now: Date): ListingIntent | undefined {
  const q = foldAccents(question);
  if (/\b\d{11}\b/.test(q)) return undefined;
  if (!LISTING_VERB.test(q) || !PLURAL_ENTITY.test(q) || !SANCTION.test(q)) return undefined;

  const year = now.getFullYear();
  // Explicit years win: one year = that year; two or more = min..max range.
  const explicit = [...q.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (explicit.length > 0) {
    return { yearFrom: Math.min(...explicit), yearTo: Math.max(...explicit) };
  }
  if (/\b(este ano|this year)\b/.test(q)) return { yearFrom: year, yearTo: year };
  if (/\b(ano pasado|last year)\b/.test(q)) return { yearFrom: year - 1, yearTo: year - 1 };
  const lastN = q.match(/\b(?:ultimos|last)\s+(\d{1,2})\s+(?:anos|years)\b/);
  if (lastN) return { yearFrom: year - Number(lastN[1]) + 1, yearTo: year };
  return {}; // listing without a period → all years
}

/** "2025" or "2019–2023" — numeric, so it reads the same in ES and EN. */
function rangeLabel(intent: ListingIntent): string | undefined {
  if (intent.yearFrom == null || intent.yearTo == null) return undefined;
  return intent.yearFrom === intent.yearTo
    ? String(intent.yearFrom)
    : `${intent.yearFrom}–${intent.yearTo}`;
}

/**
 * Run a listing task: filter records by the year range, list distinct entities
 * as clarification candidates. An empty range falls back to ALL entities with an
 * honest note (the demo query "este año" must not dead-end when the dataset's
 * coverage stops the year before).
 */
export async function runListingTask(params: {
  task: DomainTaskPacket;
  agentId: string;
  oefa: OefaService;
  intent: ListingIntent;
  language?: Language;
}): Promise<DomainTaskResult> {
  const { task, agentId, oefa, intent, language } = params;
  const m = messages(language);
  const ranged = intent.yearFrom != null || intent.yearTo != null;
  let { records } = await oefa.searchRecords({ yearFrom: intent.yearFrom, yearTo: intent.yearTo });
  let emptyRangeNote: string | undefined;
  if (records.length === 0 && ranged) {
    ({ records } = await oefa.searchRecords({}));
    emptyRangeNote = m.listingEmptyRange(rangeLabel(intent)!);
  }
  const base: DomainTaskResult = {
    taskId: task.taskId,
    agentId: task.agentId ?? agentId,
    status: 'completed',
    summary: m.noEvidence,
    artifacts: [],
    findings: [],
    evidence: [],
    nextTasks: [],
    errors: [],
    warnings: [],
  };
  if (records.length === 0) return base;

  const entities = distinctEntities(records);
  const shown = entities.slice(0, MAX_LISTING_CANDIDATES);
  const question = [
    emptyRangeNote,
    m.listingQuestion({
      count: entities.length,
      range: emptyRangeNote ? undefined : rangeLabel(intent),
    }),
    entities.length > shown.length ? m.listingCapped(shown.length) : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    ...base,
    status: 'needs_user_input',
    summary: m.listingSummary(entities.length),
    clarification: {
      question,
      candidates: shown.map((c) => ({
        id: c.ruc ?? c.administrado,
        label: c.administrado,
        ruc: c.ruc,
        sector: c.sector,
        note: m.candidateNote(c.recordCount),
      })),
    },
  };
}
