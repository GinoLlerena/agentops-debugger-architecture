/**
 * Locale-aware number/date formatting (Reqs §6.3, L6). `locale` is a BCP-47 tag
 * (es-PE / en-US) from the active UI language — see `useLocale()`. Number
 * grouping follows the locale; Peruvian units (S/, UIT) are kept verbatim where
 * amounts are rendered.
 */

export function formatNumber(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

/** Format an ISO date in the locale; `fallback` is returned for an unparseable value. */
export function formatDate(iso: string, locale: string, fallback = '—'): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString(locale);
}
