import { creditsExpiringEmail, sendEmail } from '@/lib/email';
import type { Db } from '@/lib/shelf/db';
import type { Billing } from './billing';
import type { Clock, Wallet } from './wallet';

/* The credits cron: settle holds nobody settled in time, expire old lots, add
   the next month of every annual plan, and warn people a week before a top-up
   or a gift of credits ends (plan credits renew, so they get no warning). */

const WARN_MS = 7 * 86_400_000;

export async function runCreditJobs(d: { db: Db; wallet: Wallet; billing: Billing; siteURL: string; clock?: Clock }) {
  const now = (d.clock ?? (() => new Date()))();
  const swept = await d.wallet.sweep();
  const slices = await d.billing.addAnnualSlices();
  const { rows } = await d.db.query<{ id: string; userId: string; email: string; name: string; left: number; expiresAt: Date }>(
    `select l.id::text, l."userId", u.email, u.name, l.remaining - l.held as left, l."expiresAt"
     from credit_lot l join "user" u on u.id = l."userId"
     where l."closedAt" is null and l."warnedAt" is null and l.source in ('pack', 'promo', 'adjust')
       and l."expiresAt" > $1 and l."expiresAt" <= $2 and l.remaining - l.held > 0
     order by l."expiresAt" limit 100`,
    [now, new Date(now.getTime() + WARN_MS)],
  );
  let warned = 0;
  for (const r of rows) {
    // mark first: a failed email is better than one sent every few minutes
    const claimed = await d.db.query(`update credit_lot set "warnedAt" = $2 where id = $1 and "warnedAt" is null`, [r.id, now]);
    if (!claimed.rowCount) continue;
    const endsOn = new Date(r.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    try {
      await sendEmail({ to: r.email, ...creditsExpiringEmail(r.name, r.left, endsOn, `${d.siteURL}/app/account#billing`) });
      warned++;
    } catch (e) {
      console.warn('[citezeno] credits: expiry warning email failed', e);
    }
  }
  return { ...swept, slices, warned };
}
