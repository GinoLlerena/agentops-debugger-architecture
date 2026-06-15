import type { DocMetadata } from './types.js';

/**
 * Minimal YAML-frontmatter parser (no yaml dependency). Handles the simple
 * `key: value` frontmatter our seed corpus uses; values are treated as strings
 * (quotes stripped). Numeric `page` is coerced.
 */
export function parseFrontmatter(raw: string): { metadata: DocMetadata; body: string } {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: raw };

  const [, fm, body] = match;
  const metadata: DocMetadata = {};
  for (const line of fm!.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let value: string | number = m[2]!.trim().replace(/^["']|["']$/g, '');
    if (key === 'page' && /^\d+$/.test(value)) value = Number(value);
    metadata[key] = value;
  }
  return { metadata, body: (body ?? '').trim() };
}
