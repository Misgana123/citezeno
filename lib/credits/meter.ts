import { creditsForCost } from '@/lib/pricing';
import type { ChatModel } from '@/lib/providers/chat/types';
import type { Wallet } from './wallet';

/* One paid action as the features see it: hold → record → settle.

   Nothing touches the wallet until the first step that costs money asks to
   `reserve` its estimate, so an action that turns out free (a cached summary)
   never needs credits. Each reserve tops the hold up to cover what's been spent
   plus every estimate still running (steps can run side by side) plus the next
   one; a hold that can't grow throws
   InsufficientCredits before the step runs. `finish` settles at the recorded
   real cost, or at nothing when the action failed without a useful result. */

/* `reservedUsd`: the estimate reserved for this step, now replaced by its real cost (defaults to the cost). */
export type Line = { kind: string; provider?: string; label?: string; units?: Record<string, unknown>; costUsd: number; ok?: boolean; reservedUsd?: number };

export type Meter = {
  /* the action's id, once it has a hold */
  readonly actionId: string | null;
  /* real cost recorded so far, in dollars */
  spentUsd(): number;
  /* credits held now */
  held(): number;
  /* hold a budget up front (down to `min` when the balance is short); throws InsufficientCredits */
  start(credits: number, min?: number): Promise<number>;
  /* make sure the hold covers what's spent plus `usd` more; throws InsufficientCredits,
     or BudgetReached past maxCredits (or past `opts.limit`, a lower cap for this step) */
  reserve(usd: number, opts?: { limit?: number }): Promise<void>;
  /* like reserve, but answers false instead of throwing */
  tryReserve(usd: number, opts?: { limit?: number }): Promise<boolean>;
  record(line: Line): Promise<void>;
  /* useful: false when the action failed and gave the user nothing (charged 0) */
  finish(o: { outcome: string; useful: boolean }): Promise<{ charged: number } | null>;
};

export type MeterOptions = {
  userId: string;
  kind: string;
  ttlMs?: number;
  meta?: Record<string, unknown>;
  /* reuse this action id (a background job that resumes); a settled one is never charged again */
  actionId?: string;
  /* extra credits held on top of each estimate, so small overruns don't need another round trip */
  headroom?: number;
  /* the most this action may be charged (an assistant reply's budget cap) */
  maxCredits?: number;
};

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/* What a model call might cost at most: the prompt (about 4 characters a token) and every output token allowed. */
export function estimateChatUsd(model: Pick<ChatModel, 'inputUsdPerM' | 'outputUsdPerM'>, promptChars: number, maxOutputTokens: number) {
  return (Math.ceil(promptChars / 4) * model.inputUsdPerM + maxOutputTokens * model.outputUsdPerM) / 1_000_000;
}

export function createMeter(wallet: Wallet, o: MeterOptions): Meter {
  let actionId: string | null = null;
  let held = 0;
  let spent = 0;
  // estimates reserved for steps that haven't recorded their cost yet
  let pending = 0;
  let settled = false;
  let adopted = false;
  let chain: Promise<unknown> = Promise.resolve();
  // one wallet change at a time, in order (parallel tool calls share the meter)
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  async function adopt() {
    if (adopted || !o.actionId) return;
    adopted = true;
    const seen = await wallet.spent(o.actionId);
    if (!seen) return;
    actionId = o.actionId;
    held = seen.held;
    spent = seen.costUsd;
    settled = seen.status === 'settled';
  }

  async function cover(usd: number, limit?: number) {
    await adopt();
    if (settled) return; // already charged once: what's left is on us
    const need = Math.max(1, creditsForCost(spent + pending + Math.max(0, usd))) + (o.headroom ?? 0);
    const cap = Math.min(limit ?? Infinity, o.maxCredits ?? Infinity);
    if (need > cap) {
      const { BudgetReached } = await import('./errors');
      throw new BudgetReached(o.maxCredits ?? cap);
    }
    if (!actionId) {
      const h = await wallet.hold({ userId: o.userId, kind: o.kind, amount: need, ttlMs: o.ttlMs ?? DEFAULT_TTL_MS, meta: o.meta, actionId: o.actionId });
      actionId = h.actionId;
      held = h.held;
      return;
    }
    if (need > held) {
      const ok = await wallet.extend(o.userId, actionId, need - held, o.ttlMs ?? DEFAULT_TTL_MS);
      if (!ok) {
        const { InsufficientCredits } = await import('./errors');
        throw new InsufficientCredits(await wallet.balance(o.userId), need - held);
      }
      held = need;
    }
  }

  return {
    get actionId() {
      return actionId;
    },
    spentUsd: () => spent,
    held: () => held,
    start: (credits, min) =>
      serial(async () => {
        await adopt();
        if (actionId || settled) return held;
        const want = Math.max(1, Math.min(Math.ceil(credits), o.maxCredits ?? Infinity));
        const h = await wallet.hold({ userId: o.userId, kind: o.kind, amount: want, min: Math.min(want, Math.max(1, Math.ceil(min ?? want))), ttlMs: o.ttlMs ?? DEFAULT_TTL_MS, meta: o.meta, actionId: o.actionId });
        actionId = h.actionId;
        held = h.held;
        return held;
      }),
    reserve: (usd, opts) =>
      serial(async () => {
        await cover(usd, opts?.limit);
        pending += Math.max(0, usd);
      }),
    tryReserve: (usd, opts) =>
      serial(async () => {
        try {
          await cover(usd, opts?.limit);
          pending += Math.max(0, usd);
          return true;
        } catch (e) {
          if ((e as Error)?.name === 'CreditError') return false;
          throw e;
        }
      }),
    record: (line) =>
      serial(async () => {
        await adopt();
        const ok = line.ok !== false;
        const cost = Number.isFinite(line.costUsd) && line.costUsd > 0 ? line.costUsd : 0;
        pending = Math.max(0, pending - (line.reservedUsd ?? cost));
        const { reservedUsd: _r, ...stored } = line;
        if (!actionId) {
          if (!cost || !ok) return;
          // a cost nobody reserved for (shouldn't happen): hold what's there and record it
          await cover(0).catch(() => {});
          if (!actionId) return;
        }
        if (settled) return;
        await wallet.addLine(actionId, { ...stored, costUsd: cost, ok });
        if (ok) spent += cost;
      }),
    finish: ({ outcome, useful }) =>
      serial(async () => {
        await adopt();
        if (!actionId || settled) return null;
        settled = true;
        const r = await wallet.settle({ actionId, userId: o.userId, outcome, ...(useful ? {} : { credits: 0 }) });
        return { charged: r.charged };
      }),
  };
}

/* A meter that charges nothing: for work that is the owner's cost (shared papers, re-embedding). */
export const freeMeter: Meter = {
  actionId: null,
  spentUsd: () => 0,
  held: () => 0,
  start: async () => 0,
  reserve: async () => {},
  tryReserve: async () => true,
  record: async () => {},
  finish: async () => null,
};
