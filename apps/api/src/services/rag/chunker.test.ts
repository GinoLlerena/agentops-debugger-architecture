import { describe, expect, it } from 'vitest';
import { chunkDocument, chunkText, estimateTokens } from './chunker.js';
import { parseFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('extracts key/value frontmatter and the body', () => {
    const { metadata, body } = parseFrontmatter(
      '---\ntitle: "Resolución X"\ndocumentType: resolucion_dfai\npage: 14\n---\n\nCuerpo del documento.',
    );
    expect(metadata.title).toBe('Resolución X');
    expect(metadata.documentType).toBe('resolucion_dfai');
    expect(metadata.page).toBe(14);
    expect(body).toBe('Cuerpo del documento.');
  });

  it('returns the raw text when there is no frontmatter', () => {
    const { metadata, body } = parseFrontmatter('Sin frontmatter.');
    expect(metadata).toEqual({});
    expect(body).toBe('Sin frontmatter.');
  });
});

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('Un párrafo corto.')).toEqual(['Un párrafo corto.']);
  });

  it('splits long text into multiple chunks under the size cap', () => {
    const para = 'palabra '.repeat(80).trim(); // ~640 chars
    const text = [para, para, para].join('\n\n');
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(800);
  });

  it('hard-splits a single oversized paragraph', () => {
    const huge = 'x'.repeat(2500);
    const chunks = chunkText(huge, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('estimateTokens approximates ~4 chars per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('chunkDocument', () => {
  it('parses frontmatter and stamps metadata onto every chunk', () => {
    const chunks = chunkDocument({
      id: 'doc1',
      text: '---\ndocumentType: guia\n---\n\nContenido uno.\n\nContenido dos.',
      metadata: { source: 'seed' },
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.id).toBe('doc1:0');
    expect(chunks[0]!.documentId).toBe('doc1');
    expect(chunks[0]!.metadata.documentType).toBe('guia');
    expect(chunks[0]!.metadata.source).toBe('seed');
  });
});
