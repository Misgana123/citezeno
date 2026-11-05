/* Pricing rules shared by the browser and the server. */

/* Each claim Citezeno searches for costs this many credits: every claim in a
   full trace, or the one passage in "Cite this claim". */
export const CREDITS_PER_CLAIM = 1;

/* The free allowance every account gets each calendar month (UTC). Unused free
   credits don't roll over. Purchased credits never expire. */
export const FREE_MONTHLY_CREDITS = Number(process.env.NEXT_PUBLIC_FREE_MONTHLY_CREDITS || 30);

export type Balance = { free: number; paid: number; total: number; freeMonthly: number; resetsAt: string };

export type LedgerRow = { id: string; createdAt: string; delta: number; reason: string; meta: Record<string, unknown>; refunded: boolean };

export const REASONS: Record<string, string> = {
  monthly: 'Monthly free credits',
  purchase: 'Credits purchased',
  refund: 'Payment refunded',
  trace: 'Traced claims',
  cite: 'Cited a claim',
  'trace-refund': 'Unused credits returned',
  adjust: 'Adjustment',
};

/* The first instant of next month, UTC: when free credits reset. */
export function nextReset(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
