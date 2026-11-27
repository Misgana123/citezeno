import type { ProviderDefinition } from '../types';

/* The embeddings job: turn text into vectors for search by meaning. Every
   embeddings provider takes and returns this vendor-neutral format. */

/* A model in the catalog (models.ts). */
export type EmbeddingModel = {
  id: string; // ours, stable: what READER_EMBEDDING_MODEL names and stored vectors record
  provider: string; // registry name of the embeddings provider
  vendorModel: string; // the vendor's model name
  usdPerM: number; // price per million input tokens
  maxInputTokens: number; // longest text the model reads (longer text is cut)
  maxBatch: number; // most texts per call
  taskInText?: boolean; // the model reads the job (query or document) from the text itself (see task.ts)
  fallback?: string; // a model in the catalog that gives the same vectors, used while this one's provider is down or not set up
};

/* "document": text to be found (a passage); "query": what is searched with (a question). */
export type EmbedKind = 'document' | 'query';

export type EmbedInput = { text: string; title?: string | null };

export type EmbedRequest = { model: EmbeddingModel; kind: EmbedKind; inputs: EmbedInput[]; dimensions: number };

export type EmbedResponse = { vectors: number[][]; tokens: number; costUsd: number };

export interface EmbeddingsProvider {
  readonly name: string;
  /* One call: at most model.maxBatch inputs, vectors in the same order. */
  embed(req: EmbedRequest): Promise<EmbedResponse>;
}

export type EmbeddingsProviderDefinition = ProviderDefinition<EmbeddingsProvider>;
