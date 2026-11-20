import { geminiEmbeddingsProvider } from '../gemini';
import type { EmbeddingsProviderDefinition } from './types';

/* Every embeddings provider. To add one: implement EmbeddingsProvider in
   lib/providers/<name>/ (its calls through the gate it is given), add it here,
   and add its models to models.ts. No reader code changes. */
export const EMBEDDINGS_PROVIDERS: Readonly<Record<string, EmbeddingsProviderDefinition>> = {
  [geminiEmbeddingsProvider.name]: geminiEmbeddingsProvider,
};
