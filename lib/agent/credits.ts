import { InsufficientCredits } from '@/lib/credits/errors';
import { createMeter, estimateChatUsd, type Meter } from '@/lib/credits/meter';
import type { Wallet } from '@/lib/credits/wallet';
import type { Limits } from '@/lib/plans';
import { creditsForCost } from '@/lib/pricing';
import type { CallCredits } from '@/lib/providers/gateway/meter';
import type { ChatModel } from '@/lib/providers/chat/types';

/* What one assistant reply costs the user: one action, one hold, one bill.

   The reply starts by holding a budget: about three typical replies on the
   chosen model, within the plan's cap (a smaller one when the balance is
   short, down to one model call). Every provider call the reply makes — each
   model turn, web search, Python run, paper lookup that misses the cache —
   reserves its estimate before it runs and records its real cost after, as a
   line on the bill (through the gateway's meter). The hold grows when needed,
   up to the cap. Tool steps must leave room for one more model call, so the
   assistant can always write its answer; a step that doesn't fit fails with a
   message the model reads. When the reply ends it is settled once, at the real
   cost: nothing when it failed without giving the user anything. */

export type ReplyKind = 'assistant' | 'research';

/* A typical reply: two model calls with a long-ish prompt and a full answer. */
const typicalUsd = (m: ChatModel) => 2 * estimateChatUsd(m, 24_000, 1_200);
/* One more model call, kept free for the final answer. */
const finalUsd = (m: ChatModel) => estimateChatUsd(m, 16_000, 2_048);

export type ReplyCredits = {
  meter: Meter;
  /* gateway hooks: every provider call in the reply goes through these */
  calls: CallCredits;
  /* hold the opening budget; throws InsufficientCredits */
  start(): Promise<number>;
  finish(o: { outcome: string; useful: boolean }): Promise<{ charged: number } | null>;
};

export function replyCredits(wallet: Wallet, o: { userId: string; kind: ReplyKind; model: ChatModel; limits: Limits; ttlMs: number; meta?: Record<string, unknown> }): ReplyCredits {
  const cap = (o.kind === 'research' ? o.limits.researchBudgetCap : o.limits.replyBudgetCap) ?? 0;
  const meter = createMeter(wallet, { userId: o.userId, kind: o.kind, maxCredits: cap, ttlMs: o.ttlMs, meta: { model: o.model.id, ...o.meta } });
  const keep = creditsForCost(finalUsd(o.model));
  const toolLimit = Math.max(1, cap - keep);
  return {
    meter,
    calls: {
      before: (provider, usd) => meter.reserve(usd, provider === o.model.provider ? undefined : { limit: toolLimit }),
      after: (c) =>
        meter.record({ kind: c.provider === o.model.provider ? 'model' : c.provider, provider: c.provider, label: c.provider === o.model.provider ? o.model.id : c.label, costUsd: c.costUsd, ok: c.ok, reservedUsd: c.reservedUsd }),
    },
    async start() {
      const budget = Math.min(cap, Math.max(3, creditsForCost(3 * typicalUsd(o.model))));
      const min = Math.min(budget, Math.max(1, creditsForCost(finalUsd(o.model))));
      return meter.start(budget, min);
    },
    finish: (f) => meter.finish(f),
  };
}

/* Shown when a reply can't continue for want of credits. */
export const BUDGET_TEXT = 'I stopped here because this reply used its credit budget. Tell me how you’d like to continue.';
export const NO_CREDITS_TEXT = 'I stopped here because you’re out of credits. Choose a plan or top up to continue.';
export const creditStopText = (e: unknown) => (e instanceof InsufficientCredits ? NO_CREDITS_TEXT : BUDGET_TEXT);

/* An estimate to show before a reply or a deep research run starts, in credits. */
export function replyEstimate(kind: ReplyKind, model: ChatModel, limits: Limits): { low: number; high: number } | null {
  const cap = kind === 'research' ? limits.researchBudgetCap : limits.replyBudgetCap;
  if (cap == null) return null;
  const one = Math.max(1, creditsForCost(typicalUsd(model)));
  return kind === 'research' ? { low: Math.min(cap, one * 8), high: Math.min(cap, one * 20) } : { low: Math.min(cap, one), high: Math.min(cap, one * 3) };
}
