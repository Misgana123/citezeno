import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AccountPanels } from '@/components/account/AccountPanels';
import { Footer, Nav } from '@/components/Nav';
import { auth, enabledProviders } from '@/lib/auth';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession('/account');
  const h = await headers();

  const [accounts, sessions, stats] = await Promise.all([
    auth.api.listUserAccounts({ headers: h }).catch(() => []),
    auth.api.listSessions({ headers: h }).catch(() => []),
    pool
      .query<{ n: string; sources: string | null; last: Date | null }>(
        `select count(*) as n, sum(sources) as sources, max("savedAt") as last from trace where "userId" = $1`,
        [session.user.id],
      )
      .then((r) => r.rows[0])
      .catch(() => ({ n: '0', sources: '0', last: null })),
  ]);

  const u = session.user;
  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Your account</h1>
          <p className="lede">
            Manage your profile, sign-in methods and devices. Your traces live in the{' '}
            <Link href="/studio" style={{ color: 'var(--ink)', fontWeight: 650 }}>
              studio
            </Link>{' '}
            library.
          </p>
        </header>
        <AccountPanels
          user={{ id: u.id, name: u.name, email: u.email, image: u.image ?? null, emailVerified: u.emailVerified, createdAt: new Date(u.createdAt).getTime() }}
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
          stats={{ traces: Number(stats.n) || 0, sources: Number(stats.sources) || 0, last: stats.last ? new Date(stats.last).getTime() : null }}
        />
      </main>
      <Footer />
    </>
  );
}
