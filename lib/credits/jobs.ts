import { creditsExpiringEmail, sendEmail } from '@/lib/email';
import type { Db } from '@/lib/shelf/db';
import type { Billing } from './billing';
import { creditChecks, hasFindings, type CheckFindings } from './report';
import type { Clock, Wallet } from './wallet';

/* The credits cron: settle holds nobody settled in time, expire old lots, add
   the next month of every annual plan, warn people a week before a top-up or a
   gift of credits ends (plan credits renew, so they get no warning), and once
   a day run the owner's checks (lib/credits/report.ts), emailing the admins
   when something needs a look. */

async function dailyChecks(db: Db, now: Date, alert: (f: CheckFindings) => Promise<void>) {
  const day = now.toISOString().slice(0, 10);
  const claimed = await db.query(`insert into credit_check (day) values ($1) on conflict do nothing`, [day]);
  if (!claimed.rowCount) return null;
  const findings = await creditChecks(db);
  await db.query(`update credit_check set findings = $2 where day = $1`, [day, JSON.stringify(findings)]);
  if (hasFindings(findings)) await alert(findings).catch((e) => console.error('[citezeno] credits: check alert failed', e));
  return findings;
}

/* Email the admins (ADMIN_EMAILS) what the daily checks found. Always logged. */
export async function emailFindings(f: CheckFindings) {
  const lines = [
    f.mismatched.length ? `${f.mismatched.length} account(s) whose credits don't match their history: ${f.mismatched.slice(0, 10).join(', ')}` : '',
    f.stuckHolds ? `${f.stuckHolds} hold(s) past their time and not settled (is the credits cron running?)` : '',
    ...f.lowMargin.map((m) => `${m.kind}: margin ${Math.round(m.margin * 100)}% yesterday over ${m.actions} actions (under 60%)`),
    ...f.spikes.map((s) => `${s.email ?? s.userId}: ${s.today} credits today, usually about ${s.usual} a day`),
  ].filter(Boolean);
  console.warn(`[citezeno] credits: daily checks found\n${lines.join('\n')}`);
  const to = (process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return;
  await sendEmail({ to, subject: 'Citezeno: credit checks need a look', text: lines.join('\n'), html: `<ul>${lines.map((l) => `<li>${l.replace(/</g, '&lt;')}</li>`).join('')}</ul>` });
}

const WARN_MS = 7 * 86_400_000;

export async function runCreditJobs(d: { db: Db; wallet: Wallet; billing: Billing; siteURL: string; clock?: Clock; alert?: (f: CheckFindings) => Promise<void> }) {
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
      await sendEmail({ to: r.email, ...creditsExpiringEmail(r.name, r.left, endsOn, `${d.siteURL}/app/chat?settings=usage`) });
      warned++;
    } catch (e) {
      console.warn('[citezeno] credits: expiry warning email failed', e);
    }
  }
  const checks = await dailyChecks(d.db, now, d.alert ?? emailFindings);
  return { ...swept, slices, warned, checked: checks != null };
}
