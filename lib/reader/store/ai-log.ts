import type { Queryable } from '@/lib/shelf/db';

/* Every AI call the reader makes (user, paper, action, model, tokens, cost),
   so the numbers are there when credits are designed. Logging never breaks the call. */

export type AiAction = 'embed' | 'summary' | 'ask' | 'explain' | 'rewrite' | 'section_notes';

export async function logAiCall(
  q: Queryable,
  e: { userId: string | null; paperId: string; action: AiAction; model: string; inputTokens: number; outputTokens: number; costUsd: number },
): Promise<void> {
  try {
    await q.query(
      `insert into reader_ai_log ("userId", "paperId", action, model, "inputTokens", "outputTokens", "costUsd") values ($1, $2, $3, $4, $5, $6, $7)`,
      [e.userId, e.paperId, e.action, e.model, e.inputTokens, e.outputTokens, e.costUsd],
    );
  } catch (err) {
    console.error('[citezeno] reader: could not log an AI call', err);
  }
}
