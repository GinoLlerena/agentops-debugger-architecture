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
 * - only `.` present → treated as the decimal point.
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
    const parts = cleaned.split(',');
    normalized =
      parts.length === 2 && parts[1]!.length > 0 && parts[1]!.length <= 2
        ? parts.join('.') // decimal comma, e.g. "12,5" → 12.5
        : parts.join(''); // thousands commas, e.g. "1,584,000" → 1584000
  } else {
    normalized = cleaned; // dot-only or plain
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
