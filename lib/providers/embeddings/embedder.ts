import type { Env, Gate } from '../types';
import { DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS } from './models';
import { EMBEDDINGS_PROVIDERS } from './registry';
import type { EmbedInput, EmbedKind, EmbeddingModel, EmbeddingsProviderDefinition } from './types';

/* The configured embedding model, ready to use: inputs are sent in batches the
   model accepts, and every vector comes back normalized to length 1 (so cosine
   search is right whatever the vendor does at reduced sizes).

     READER_EMBEDDING_MODEL        a model ID from models.ts (default gemini-embedding-001)
     READER_EMBEDDING_DIMENSIONS   stored vector size, 128–2000 (default 768)

   null when the model's provider isn't configured (no key): search by meaning
   is off and keyword search carries on. */

export type Embedder = {
  readonly model: EmbeddingModel;
  readonly dimensions: number;
  embed(kind: EmbedKind, inputs: EmbedInput[]): Promise<{ vectors: number[][]; tokens: number; costUsd: number }>;
};

export function normalize(v: number[]): number[] {
  const len = Math.hypot(...v);
  return len > 0 ? v.map((x) => x / len) : v;
}

export function embeddingSettings(env: Env, catalog: readonly EmbeddingModel[] = EMBEDDING_MODELS): { model: EmbeddingModel; dimensions: number } {
  const wanted = env.READER_EMBEDDING_MODEL?.trim();
  let model = catalog.find((m) => m.id === wanted);
  if (wanted && !model) console.warn(`[citezeno] embeddings: unknown READER_EMBEDDING_MODEL "${wanted}", using ${DEFAULT_EMBEDDING_MODEL}`);
  model ??= catalog.find((m) => m.id === DEFAULT_EMBEDDING_MODEL) ?? catalog[0];
  const n = Math.floor(Number(env.READER_EMBEDDING_DIMENSIONS));
  const dimensions = Number.isFinite(n) && n >= 128 && n <= 2000 ? n : DEFAULT_EMBEDDING_DIMENSIONS;
  return { model, dimensions };
}

export function embedder(
  env: Env,
  gate: Gate,
  catalog: readonly EmbeddingModel[] = EMBEDDING_MODELS,
  registry: Readonly<Record<string, EmbeddingsProviderDefinition>> = EMBEDDINGS_PROVIDERS,
): Embedder | null {
  const { model, dimensions } = embeddingSettings(env, catalog);
  const provider = registry[model.provider]?.create(env, gate) ?? null;
  if (!provider) return null;
  return {
    model,
    dimensions,
    async embed(kind, inputs) {
      const vectors: number[][] = [];
      let tokens = 0;
      let costUsd = 0;
      for (let i = 0; i < inputs.length; i += model.maxBatch) {
        const res = await provider.embed({ model, kind, inputs: inputs.slice(i, i + model.maxBatch), dimensions });
        vectors.push(...res.vectors.map(normalize));
        tokens += res.tokens;
        costUsd += res.costUsd;
      }
      return { vectors, tokens, costUsd };
    },
  };
}
