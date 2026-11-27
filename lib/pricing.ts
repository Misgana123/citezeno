/* Pricing rules shared by the browser and the server. */

/* Each claim Citezeno searches for costs this many credits: every claim in a
   full trace, or the one passage in "Cite this claim". A fixed product price,
   not one worked out from cost. */
export const CREDITS_PER_CLAIM = 1;

/* One credit is $0.01 to the user and covers at most this much real provider
   cost, which keeps about a 70% margin on variable cost. */
export const USD_PER_CREDIT_COST = 0.003;

/* The one conversion from what an action really cost us to the credits it is
   charged: rounded up, at least 1 for anything that cost money, 0 for nothing
   (cache hits, shared copies, free tools). Applied once per action, never per step. */
export function creditsForCost(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  // the small allowance keeps floating-point noise (0.006000000001) from adding a credit
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT_COST - 1e-9));
}

export type LotSource = 'plan' | 'pack' | 'promo' | 'legacy' | 'adjust';

/* One grant of credits as the user sees it: what's left (on hold included) and when it ends. */
export type LotView = { id: string; source: LotSource; amount: number; remaining: number; held: number; expiresAt: string | null; label: string };

/* total: credits that can be spent right now (on hold excluded). */
export type Balance = { total: number; held: number; lots: LotView[]; nextExpiry: { amount: number; at: string } | null };

export type LedgerRow = { id: string; createdAt: string; delta: number; kind: string; reason: string; meta: Record<string, unknown> };

export const REASONS: Record<string, string> = {
  plan: 'Plan credits',
  pack: 'Credits purchased',
  promo: 'Credits from the team',
  legacy: 'Credits carried over',
  'legacy-free': 'Last free monthly credits',
  'action-refund': 'Credits returned by support',
  assistant: 'Assistant answer',
  research: 'Deep research',
  'reader.summary': 'Paper summary',
  'reader.ask': 'Question about a paper',
  'reader.explain': 'Explanation',
  'reader.embed': 'Your PDF prepared for questions',
  adjust: 'Adjustment',
  expire: 'Credits expired',
  refund: 'Payment refunded',
  chargeback: 'Payment disputed',
  trace: 'Traced claims',
  cite: 'Cited a claim',
  // older history rows
  monthly: 'Monthly free credits',
  purchase: 'Credits purchased',
  'trace-refund': 'Unused credits returned',
};

/* What a lot is called in the balance breakdown. */
export const LOT_LABELS: Record<LotSource, string> = {
  plan: 'Plan credits',
  pack: 'Top-up',
  promo: 'From the team',
  legacy: 'Carried over',
  adjust: 'Adjustment',
};
