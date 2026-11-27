import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import type { Db } from '@/lib/shelf/db';
import { CreditError } from './errors';
import type { Guard, Wallet } from './wallet';

/* Studio traces and "Cite this claim": a fixed product price of one credit per
   claim, charged hold → settle. The search runs in the browser, so the server
   can't watch it: the browser reports how many claims it searched and the hold
   settles at that. A hold the browser never reports on is charged in full when
   it times out (otherwise not reporting would make tracing free), and settling
   for less than the hold (a stopped trace, nothing found) is allowed a limited
   number of times a day. */

export type ClaimKind = 'trace' | 'cite';
export const CLAIM_HOLD_MS = 15 * 60 * 1000;
export const SHORT_SETTLES_PER_DAY = 10;

export function holdClaims(wallet: Wallet, userId: string, claims: number, kind: ClaimKind, guard?: Guard) {
  return wallet.hold({ userId, kind, amount: claims * CREDITS_PER_CLAIM, ttlMs: CLAIM_HOLD_MS, onTimeout: 'full', meta: { claims }, guard });
}

export async function settleClaims(db: Db, wallet: Wallet, userId: string, actionId: string, searched: number) {
  const { rows } = await db.query<{ kind: string; held: number; status: string; claims: number | null }>(
    `select kind, held, status, (meta->>'claims')::int as claims from credit_action where id = $1 and "userId" = $2`,
    [actionId, userId],
  );
  const a = rows[0];
  if (!a || (a.kind !== 'trace' && a.kind !== 'cite')) throw new CreditError('not_found', 'That trace was not found.');
  const claims = a.claims ?? a.held;
  const done = Math.max(0, Math.min(claims, Math.floor(searched)));
  let charge = done * CREDITS_PER_CLAIM;
  let outcome = done >= claims ? 'finished' : done ? 'partial' : 'nothing';
  if (a.status === 'held' && charge < a.held) {
    const short = await db.query<{ n: number }>(
      `select count(*)::int as n from credit_action where "userId" = $1 and kind in ('trace', 'cite') and status = 'settled'
       and charged < held and outcome in ('partial', 'nothing') and "settledAt" > now() - interval '1 day'`,
      [userId],
    );
    if (short.rows[0].n >= SHORT_SETTLES_PER_DAY) {
      charge = a.held;
      outcome = 'finished';
    }
  }
  return wallet.settle({ actionId, userId, credits: charge, outcome });
}
