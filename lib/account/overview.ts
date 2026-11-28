import 'server-only';
import { auth, enabledProviders } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { billing, wallet } from '@/lib/credits/server';
import { usageFor, type UsageRow } from '@/lib/credits/usage';
import { pool } from '@/lib/db';
import { polarEnabled } from '@/lib/polar';
import type { Balance, LedgerRow } from '@/lib/pricing';

/* Everything the Settings dialog shows about the account, in one answer:
   profile, sign-in methods and devices, plan, credits and usage, and the
   saved traces. Loaded when the dialog opens. */

export type AccountOverview = {
  user: { id: string; name: string; email: string; image: string | null; emailVerified: boolean; createdAt: number; twoFactorEnabled: boolean };
  /* the session token of this browser, to tell "This device" apart */
  currentToken: string;
  /* sign-in methods the user has, and the ones this site offers */
  providers: string[];
  available: string[];
  sessions: { token: string; userAgent: string; ipAddress: string; createdAt: number; expiresAt: number }[];
  plan: { name: string; interval: 'month' | 'year'; periodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  usage: UsageRow[];
  balance: Balance;
  history: LedgerRow[];
  polar: boolean;
  stats: { traces: number; sources: number; last: number | null };
  admin: boolean;
};

export async function accountOverview(h: Headers): Promise<AccountOverview | null> {
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user;
  const plan = await billing().currentPlan(u.id);
  const [accounts, sessions, stats, balance, history, usage] = await Promise.all([
    auth.api.listUserAccounts({ headers: h }).catch(() => []),
    auth.api.listSessions({ headers: h }).catch(() => []),
    pool
      .query<{ n: string; sources: string | null; last: Date | null }>(`select count(*) as n, sum(sources) as sources, max("savedAt") as last from trace where "userId" = $1`, [u.id])
      .then((r) => r.rows[0])
      .catch(() => ({ n: '0', sources: '0', last: null })),
    wallet().balance(u.id),
    wallet().history(u.id, 15),
    usageFor(pool, u.id, plan?.plan ?? null),
  ]);
  return {
    user: { id: u.id, name: u.name, email: u.email, image: u.image ?? null, emailVerified: u.emailVerified, createdAt: new Date(u.createdAt).getTime(), twoFactorEnabled: Boolean((u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) },
    currentToken: session.session.token,
    providers: accounts.map((a) => a.providerId),
    available: [...enabledProviders],
    sessions: sessions.map((s) => ({ token: s.token, userAgent: s.userAgent ?? '', ipAddress: s.ipAddress ?? '', createdAt: new Date(s.createdAt).getTime(), expiresAt: new Date(s.expiresAt).getTime() })),
    plan: plan ? { name: usage.planName, interval: plan.interval, periodEnd: plan.periodEnd, cancelAtPeriodEnd: plan.cancelAtPeriodEnd } : null,
    usage: usage.rows,
    balance,
    history,
    polar: polarEnabled,
    stats: { traces: Number(stats.n) || 0, sources: Number(stats.sources) || 0, last: stats.last ? new Date(stats.last).getTime() : null },
    admin: isAdmin(u),
  };
}
