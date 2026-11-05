import type { Metadata } from 'next';
import Link from 'next/link';
import { ColumnChart } from '@/components/admin/ColumnChart';
import { GrantCredits, HandledToggle } from '@/components/admin/AdminActions';
import { Footer, Nav } from '@/components/Nav';
import { requireAdmin } from '@/lib/admin';
import { pool } from '@/lib/db';
import { timeAgo } from '@/lib/library';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const DAYS = 30;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* One row per day for the last 30 days (UTC), zero-filled. */
async function daily(sql: string) {
  const { rows } = await pool.query<{ day: string; value: string }>(
    `with days as (select generate_series((now() at time zone 'utc')::date - ${DAYS - 1}, (now() at time zone 'utc')::date, interval '1 day')::date as day)
     select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(x.value, 0) as value from days left join (${sql}) x on x.day = days.day order by days.day`,
  );
  return rows.map((r) => ({ day: r.day, value: Number(r.value) }));
}

const money = (cents: number, cur: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);

export default async function AdminPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  const inbox = sp.inbox === 'all' ? 'all' : 'open';

  const [kpi, revenue, signups, spent, users, messages] = await Promise.all([
    pool
      .query<Record<string, string>>(
        `select
          (select count(*) from "user") as users,
          (select count(*) from "user" where "createdAt" > now() - interval '7 days') as users7,
          (select count(distinct "userId") from credit_ledger where reason in ('trace','cite') and "createdAt" > now() - interval '7 days') as active7,
          (select count(*) from trace) as traces,
          (select coalesce(-sum("freeDelta" + "paidDelta"), 0) from credit_ledger where reason in ('trace','cite') and not refunded and "createdAt" > now() - interval '30 days') as spent30,
          (select count(*) from credit_ledger where reason = 'purchase' and "createdAt" > now() - interval '30 days') as orders30,
          (select count(*) from trace where "shareToken" is not null) as shared,
          (select count(*) from contact_message where not handled) as inbox`,
      )
      .then((r) => r.rows[0]),
    pool
      .query<{ currency: string; cents: string }>(
        `select coalesce(meta->>'currency', 'usd') as currency, sum((meta->>'amount')::bigint) as cents
         from credit_ledger where reason = 'purchase' and "createdAt" > now() - interval '30 days' and meta ? 'amount' group by 1`,
      )
      .then((r) => r.rows),
    daily(`select ("createdAt" at time zone 'utc')::date as day, count(*) as value from "user" group by 1`),
    daily(`select ("createdAt" at time zone 'utc')::date as day, -sum("freeDelta" + "paidDelta") as value from credit_ledger where reason in ('trace','cite') and not refunded group by 1`),
    pool
      .query<{ id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; traces: string; total: number | null }>(
        `select u.id, u.name, u.email, u."emailVerified", u."createdAt",
           (select count(*) from trace t where t."userId" = u.id) as traces,
           (select b.free + b.paid from credit_balance b where b."userId" = u.id) as total
         from "user" u
         where $1 = '' or u.email ilike '%' || $1 || '%' or u.name ilike '%' || $1 || '%'
         order by u."createdAt" desc limit 50`,
        [q],
      )
      .then((r) => r.rows),
    pool
      .query<{ id: string; createdAt: Date; name: string; email: string; topic: string; message: string; handled: boolean; delivered: boolean }>(
        `select id, "createdAt", name, email, topic, message, handled, delivered from contact_message
         where $1 = 'all' or not handled order by "createdAt" desc limit 30`,
        [inbox],
      )
      .then((r) => r.rows),
  ]);

  const tiles: [string, string, string?][] = [
    [Number(kpi.users).toLocaleString(), 'Accounts', `+${kpi.users7} this week`],
    [Number(kpi.active7).toLocaleString(), 'Active this week', 'ran at least one search'],
    [Number(kpi.traces).toLocaleString(), 'Saved traces', `${kpi.shared} shared publicly`],
    [Number(kpi.spent30).toLocaleString(), 'Credits used', 'last 30 days'],
    [revenue.length ? revenue.map((r) => money(Number(r.cents), r.currency)).join(' + ') : '—', 'Revenue', `${kpi.orders30} orders, last 30 days`],
    [Number(kpi.inbox).toLocaleString(), 'Open messages', 'in the contact inbox'],
  ];

  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Admin</h1>
          <p className="lede">Accounts, usage, revenue and the contact inbox. Revenue counts paid Polar orders before refunds.</p>
        </header>

        <section className="adm-tiles" aria-label="Key numbers">
          {tiles.map(([v, label, sub]) => (
            <div className="stat" key={label}>
              <b>{v}</b>
              <span>{label}</span>
              {sub && <small>{sub}</small>}
            </div>
          ))}
        </section>

        <section className="adm-charts">
          <ColumnChart title="New accounts per day" unit="accounts" data={signups} />
          <ColumnChart title="Credits used per day" unit="credits" data={spent} />
        </section>

        <section className="panel" id="users">
          <div className="adm-head">
            <h2>Users</h2>
            <form className="adm-search" action="/admin#users">
              <input className="input" name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" />
              <button className="btn btn-sm">Search</button>
            </form>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Traces</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name || '—'}</b>
                      <small>
                        {u.email} {u.emailVerified ? '' : '· not confirmed'}
                      </small>
                    </td>
                    <td>{timeAgo(new Date(u.createdAt).getTime())}</td>
                    <td>{Number(u.traces).toLocaleString()}</td>
                    <td>
                      <GrantCredits userId={u.id} total={u.total ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length && <p className="small">No user matches “{q}”.</p>}
          </div>
        </section>

        <section className="panel" id="inbox" style={{ marginTop: 22 }}>
          <div className="adm-head">
            <h2>Contact inbox</h2>
            <nav className="seg" aria-label="Inbox filter">
              <Link href="/admin#inbox" aria-current={inbox === 'open' ? 'true' : undefined} className={inbox === 'open' ? 'on' : ''}>
                Open
              </Link>
              <Link href="/admin?inbox=all#inbox" aria-current={inbox === 'all' ? 'true' : undefined} className={inbox === 'all' ? 'on' : ''}>
                All
              </Link>
            </nav>
          </div>
          {!messages.length ? (
            <p className="small">Inbox zero. Nothing waiting for a reply.</p>
          ) : (
            <ul className="adm-inbox">
              {messages.map((m) => (
                <li key={m.id}>
                  <div className="adm-msg-head">
                    <span>
                      <b>{m.name}</b> · {m.topic}
                      <small>
                        {m.email} · {timeAgo(new Date(m.createdAt).getTime())}
                        {m.delivered ? '' : ' · not emailed'}
                      </small>
                    </span>
                    <span className="adm-msg-actions">
                      <a className="btn btn-ghost btn-sm" href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.topic}`)}`}>
                        Reply
                      </a>
                      <HandledToggle id={m.id} handled={m.handled} />
                    </span>
                  </div>
                  <p>{m.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
