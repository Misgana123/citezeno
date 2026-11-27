import { estimateChatUsd } from '@/lib/credits/meter';
import { isProviderError } from '@/lib/providers/errors';
import { streamOrComplete, type ChatModel, type ChatResponse } from '@/lib/providers/chat/types';
import { readerConfig, readerModels } from '../config';
import type { ReaderDeps } from '../deps';
import { ReaderError } from '../errors';
import { logAiCall, type AiAction } from '../store/ai-log';

/* The reader's AI calls: the main model (answers, summaries) and the fast one
   (Explain, follow-up rewriting, section notes), both from the chat model
   catalog and through the gateway (daily alert and hard cap). Every call is
   logged with the user, paper, action, model, tokens and cost, and charged to
   the request's credit meter (held before the call, recorded after). Failures
   become one plain message: "AI is temporarily unavailable." */

export type ReaderAi = {
  main: ChatModel;
  fast: ChatModel;
  ask(o: { model: ChatModel; action: AiAction; system: string; user: string; maxOutputTokens: number; onText?: (delta: string) => void }): Promise<ChatResponse>;
};

export const AI_OFF = () => new ReaderError('ai_unavailable', 'AI isn’t set up yet.', { reason: 'off' });
export const AI_DOWN = (reason: string) => new ReaderError('ai_unavailable', 'AI is temporarily unavailable.', { reason });

export async function readerAi(deps: ReaderDeps, who: { userId: string | null; paperId: string }): Promise<ReaderAi> {
  const chat = await deps.chat?.();
  const models = chat ? readerModels(chat, readerConfig()) : null;
  if (!chat || !models) throw AI_OFF();
  return {
    ...models,
    async ask({ model, action, system, user, maxOutputTokens, onText }) {
      let reserved = 0;
      const call = async (m: ChatModel) => {
        reserved = estimateChatUsd(m, system.length + user.length, maxOutputTokens);
        await deps.meter?.reserve(reserved);
        const provider = chat.provider(m);
        const req = { model: m, system, messages: [{ role: 'user' as const, text: user }], tools: [], maxOutputTokens };
        return onText ? streamOrComplete(provider, req, onText) : provider.complete(req);
      };
      let res: ChatResponse;
      try {
        try {
          res = await call(model);
        } catch (e) {
          // the fast model's vendor is down or refuses its key: the main model does the job instead
          if (!isProviderError(e) || e.code === 'budget' || model.id === models.main.id) throw e;
          console.warn(`[citezeno] reader: ${model.id} failed (${e.message}); using ${models.main.id}`);
          model = models.main;
          res = await call(model);
        }
      } catch (e) {
        if (isProviderError(e)) throw AI_DOWN(e.code === 'budget' ? 'cap' : e.code);
        throw e;
      }
      await logAiCall(deps.db, { userId: who.userId, paperId: who.paperId, action, model: model.id, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd: res.costUsd });
      await deps.meter?.record({ kind: 'model', provider: model.provider, label: model.id, units: { action, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens }, costUsd: res.costUsd, reservedUsd: reserved });
      return res;
    },
  };
}
