import type { EmbeddingModel } from './types';

/* The embedding models on offer. Adding one is one entry here: our stable ID,
   its provider (a name in registry.ts), the vendor's model name, its price
   (USD per million input tokens), longest input and batch size.
   READER_EMBEDDING_MODEL picks one; the default is the cheapest. */
export const EMBEDDING_MODELS: readonly EmbeddingModel[] = [
  { id: 'gemini-embedding-001', provider: 'gemini', vendorModel: 'gemini-embedding-001', usdPerM: 0.15, maxInputTokens: 2048, maxBatch: 100 },
  { id: 'gemini-embedding-2', provider: 'gemini', vendorModel: 'gemini-embedding-2', usdPerM: 0.2, maxInputTokens: 8192, maxBatch: 100 },
];

export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
/* Stored vector size: small enough for fast search, under pgvector's 2,000-dimension index limit. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
