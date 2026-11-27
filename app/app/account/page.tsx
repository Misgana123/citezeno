import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AccountPanels } from '@/components/account/AccountPanels';
import { ConnectionsPanel } from '@/components/account/ConnectionsPanel';
import { BillingPanel } from '@/components/billing/BillingPanel';
import { AppShell, PageHead } from '@/components/app/AppShell';
import { Icon } from '@/components/Icon';
import { auth, enabledProviders } from '@/lib/auth';
import { connectorCatalog } from '@/lib/connectors/catalog';
import { connectorDeps } from '@/lib/connectors/server';
import { billing, wallet } from '@/lib/credits/server';
import { usageFor } from '@/lib/credits/usage';
import { pool } from '@/lib/db';
import { polarEnabled } from '@/lib/polar';
import { requireSession } from '@/lib/session';
import { isAdmin } from '@/lib/admin';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession('/app/account');
  const h = await headers();

  const plan = await billing().currentPlan(session.user.id);
  const [accounts, sessions, stats, balance, ledger, usage, apps] = await Promise.all([
    auth.api.listUserAccounts({ headers: h }).catch(() => []),
    auth.api.listSessions({ headers: h }).catch(() => []),
    pool
      .query<{ n: string; sources: string | null; last: Date | null }>(
        `select count(*) as n, sum(sources) as sources, max("savedAt") as last from trace where "userId" = $1`,
        [session.user.id],
      )
      .then((r) => r.rows[0])
      .catch(() => ({ n: '0', sources: '0', last: null })),
    wallet().balance(session.user.id),
    wallet().history(session.user.id, 15),
    usageFor(pool, session.user.id, plan?.plan ?? null),
    connectorCatalog(connectorDeps(), session.user.id).catch((e) => {
      console.error('[citezeno] account: connected apps failed to load', e);
      return [];
    }),
  ]);

  const u = session.user;
  return (
    <AppShell current="account" title="Account">
      <PageHead
        title="Your account"
        actions={
          isAdmin(u) ? (
            <Link className="btn btn-ghost btn-sm" href="/admin">
              <Icon name="chart" /> Admin dashboard
            </Link>
          ) : undefined
        }
      >
        Manage your profile, credits, connected apps, sign-in methods and devices. Your traces live in the Library in <Link href="/app/citation">Citation</Link>.
      </PageHead>
      <AccountPanels
        user={{ id: u.id, name: u.name, email: u.email, image: u.image ?? null, emailVerified: u.emailVerified, createdAt: new Date(u.createdAt).getTime(), twoFactorEnabled: Boolean((u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) }}
        currentToken={session.session.token}
        providers={accounts.map((a) => a.providerId)}
        available={enabledProviders}
        sessions={sessions.map((s) => ({
          token: s.token,
          userAgent: s.userAgent ?? '',
          ipAddress: s.ipAddress ?? '',
          createdAt: new Date(s.createdAt).getTime(),
          expiresAt: new Date(s.expiresAt).getTime(),
        }))}
        billing={
          <BillingPanel
            initial={balance}
            history={ledger}
            polar={polarEnabled}
            plan={plan ? { name: usage.planName, interval: plan.interval, periodEnd: plan.periodEnd, cancelAtPeriodEnd: plan.cancelAtPeriodEnd } : null}
            usage={usage.rows}
          />
        }
        apps={<ConnectionsPanel connectors={apps} />}
        stats={{ traces: Number(stats.n) || 0, sources: Number(stats.sources) || 0, last: stats.last ? new Date(stats.last).getTime() : null }}
      />
    </AppShell>
  );
}
