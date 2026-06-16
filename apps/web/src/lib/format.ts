/** es-PE / OEFA formatting conventions (Reqs §6.3, L6): "1,240", "S/", DD/MM/AAAA. */

const groups = (n: number): string => n.toLocaleString('en-US'); // 1,240 grouping

export function formatUit(uit: number): string {
  return `${groups(uit)} UIT`;
}

export function formatSoles(soles: number): string {
  return `S/ ${groups(Math.round(soles))}`;
}

/** "10 UIT (S/ 53,500, UIT 2025)" when a year is known. */
export function formatFine(uit?: number, soles?: number, uitYear?: number): string {
  if (uit == null) return '—';
  if (soles == null) return formatUit(uit);
  return `${formatUit(uit)} (${formatSoles(soles)}${uitYear ? `, UIT ${uitYear}` : ''})`;
}
