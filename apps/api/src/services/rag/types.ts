/** Document metadata carried with every chunk (drives RAG filtering, FR-06). */
export interface DocMetadata {
  title?: string;
  documentType?: string; // resolucion_dfai | resolucion_tfa | informe_supervision | guia | ...
  source?: string;
  date?: string; // DD/MM/AAAA as in the source
  administrado?: string;
  resolutionNumber?: string;
  page?: number;
  [key: string]: unknown;
}

/** A document ready to be chunked and indexed. */
export interface RagDocument {
  id: string;
  text: string;
  metadata: DocMetadata;
}

/** A chunk of a document, the unit of retrieval and citation. */
export interface DocChunk {
  id: string; // `${documentId}:${index}`
  documentId: string;
  index: number;
  text: string;
  metadata: DocMetadata;
  embedding?: number[];
}

export interface RetrievalResult {
  chunk: DocChunk;
  score: number;
}

export interface RetrievalFilter {
  documentType?: string;
  source?: string;
  administrado?: string;
}

/** Pluggable embedder. The Qwen implementation is optional; the lexical path
 *  works with no embedder (decision D4). */
export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
