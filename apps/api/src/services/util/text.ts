/**
 * Shared text-normalization utilities. Centralized so entity matching (OEFA),
 * BM25 tokenization (RAG), and Junar column-alias resolution all fold Unicode
 * identically — diverging copies would make a name found by one path invisible
 * to another.
 */

/** Lowercase + strip combining diacritics (NFD). "Refinería" → "refineria". */
export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** foldAccents + collapse internal whitespace, for fuzzy text comparison. */
export function normalizeText(s: string): string {
  return foldAccents(s).replace(/\s+/g, ' ').trim();
}

/** foldAccents + non-alphanumerics → underscore, for canonical map keys. */
export function canonKey(s: string): string {
  return foldAccents(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse a number from a locale-formatted string, inferring whether `,`/`.` is the
 * decimal or thousands separator (es-PE may use either). Returns undefined when
 * no parseable number is present.
 *
 * Rules:
 * - both separators present → the last-occurring one is the decimal separator;
 * - only `,` present → decimal iff a single group of 1–2 trailing digits, else thousands;
 * - only `.` present → decimal iff a single group of 1–2 trailing digits, else thousands
 *   (so `1.584.000` → 1584000 and `1.500` → 1500, symmetric with the comma rule).
 */
export function parseLocaleNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (cleaned === '' || cleaned === '-') return undefined;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized: string;

  if (hasDot && hasComma) {
    const decimalSep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    normalized = normalizeGrouped(cleaned, ','); // "12,5"→12.5, "1,584,000"→1584000
  } else if (hasDot) {
    normalized = normalizeGrouped(cleaned, '.'); // "12.5"→12.5, "1.584.000"→1584000, "1.500"→1500
  } else {
    normalized = cleaned; // plain integer
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/** A single-separator number → JS-parseable string: a lone 1–2 digit trailing
 *  group is a decimal, anything else is a thousands grouping. Shared by the
 *  comma and dot branches so both separators disambiguate identically. */
function normalizeGrouped(cleaned: string, sep: string): string {
  const parts = cleaned.split(sep);
  return parts.length === 2 && parts[1]!.length > 0 && parts[1]!.length <= 2
    ? parts.join('.') // decimal separator
    : parts.join(''); // thousands separators
}
