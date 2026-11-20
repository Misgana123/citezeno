import type { ChatModels } from '@/lib/providers/chat/catalog';
import type { ChatModel } from '@/lib/providers/chat/types';

/* Reader settings, from server environment variables (documented in .env.example).

     READER_MODEL                answers and summaries: a model ID from the chat
                                 model list (default: the assistant's default model)
     READER_FAST_MODEL           "Explain", follow-up rewriting, section notes
                                 (default: the cheapest model on offer)
     READER_FULLTEXT_MAX_TOKENS  largest paper sent whole instead of searched (default 30000)

   The embedding model and size (READER_EMBEDDING_MODEL, READER_EMBEDDING_DIMENSIONS)
   belong to the embeddings job (lib/providers/embeddings). */

export type ReaderConfig = { model: string | null; fastModel: string | null; fullTextMaxTokens: number };

function positiveInt(v: string | undefined, fallback: number) {
  const n = Math.floor(Number(v));
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readerConfig(env: Record<string, string | undefined> = process.env): ReaderConfig {
  return {
    model: env.READER_MODEL?.trim() || null,
    fastModel: env.READER_FAST_MODEL?.trim() || null,
    fullTextMaxTokens: positiveInt(env.READER_FULLTEXT_MAX_TOKENS, 30_000),
  };
}

/* What a model costs for a typical call (input weighs more: we send passages). */
const weight = (m: ChatModel) => m.inputUsdPerM * 4 + m.outputUsdPerM;

/* The reader's two models among those on offer, or null when no AI is set up. */
export function readerModels(chat: ChatModels, config: ReaderConfig): { main: ChatModel; fast: ChatModel } | null {
  const main = chat.pick(config.model);
  if (!main) return null;
  const wanted = config.fastModel ? chat.models.find((m) => m.id === config.fastModel) : undefined;
  const fast = wanted ?? [...chat.models].sort((a, b) => weight(a) - weight(b))[0] ?? main;
  return { main, fast };
}
