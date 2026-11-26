import type { Metadata } from 'next';
import Link from 'next/link';
import { ColumnChart } from '@/components/admin/ColumnChart';
import { GrantCredits, HandledToggle, RefundAction } from '@/components/admin/AdminActions';
import { PaperCopy, type PaperCopyStats } from '@/components/admin/PaperCopy';
import { ProviderHealth, type ProviderHealthRow } from '@/components/admin/ProviderHealth';
import { AppShell, PageHead } from '@/components/app/AppShell';
import { requireAdmin } from '@/lib/admin';
import { hasFindings, marginReport, MARGIN_ALERT, recentActions, type CheckFindings, type MarginRow } from '@/lib/credits/report';
import { REASONS } from '@/lib/pricing';
import { pool } from '@/lib/db';
import { timeAgo } from '@/lib/library';
import { localCopyConfig } from '@/lib/papers/local/config';
import { copySize } from '@/lib/papers/local/maintain';
import { allSyncStates } from '@/lib/papers/local/sync';
import { providerStatsSince } from '@/lib/providers/gateway/store/pg';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const DAYS = 30;
const SERVICE_HOURS = 24;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* The outside services' counts for the last day, with what each spent today (UTC). */
async function services(): Promise<ProviderHealthRow[]> {
  const [stats, spend] = await Promise.all([
    providerStatsSince(SERVICE_HOURS),
    pool.query<{ provider: string; usd: number }>(`select provider, usd from provider_spend where day = to_char(now() at time zone 'utc', 'YYYY-MM-DD')`).then((r) => r.rows),
  ]);
  const spent = new Map(spend.map((r) => [r.provider, Number(r.usd)]));
  const names = [...new Set([...stats.keys(), ...spent.keys()])].sort();
  return names.map((provider) => ({ provider, counts: stats.get(provider) ?? new Map(), spentTodayUsd: spent.get(provider) ?? 0 }));
}

/* Our own copy of papers: its size against its limits, and each download's progress. */
async function paperCopy(): Promise<PaperCopyStats> {
  const c = localCopyConfig();
  const [size, states] = await Promise.all([copySize(pool), allSyncStates(pool)]);
  const state = new Map(states.map((s) => [s.source, s]));
  return {
    enabled: c.enabled,
    searchFirst: c.searchFirst,
    rows: size.rows,
    liveBytes: size.liveBytes,
    maxRows: c.maxRows,
    maxBytes: c.maxBytes,
    downloads: c.seeds.map((p) => {
      const s = state.get(p.source);
      return { source: p.source, target: p.target, fetched: s?.fetched ?? 0, done: !!s?.doneAt, ranAt: s?.ranAt ? new Date(s.ranAt).getTime() : null, lastError: s?.lastError ?? null };
    }),
  };
}

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

  const [kpi, revenue, signups, spent, users, messages, serviceRows, copyStats, margins, actions, lastCheck] = await Promise.all([
    pool
      .query<Record<string, string>>(
        `select
          (select count(*) from "user") as users,
          (select count(*) from "user" where "createdAt" > now() - interval '7 days') as users7,
          (select count(distinct "userId") from credit_action where "createdAt" > now() - interval '7 days') as active7,
          (select count(*) from trace) as traces,
          (select coalesce(sum(charged), 0) from credit_action where status = 'settled' and "settledAt" > now() - interval '30 days') as spent30,
          (select count(*) from credit_entry where kind = 'grant' and reason in ('plan', 'pack') and meta ? 'orderId' and coalesce((meta->>'slice')::int, 1) = 1 and "createdAt" > now() - interval '30 days') as orders30,
          (select count(*) from trace where "shareToken" is not null) as shared,
          (select count(*) from contact_message where not handled) as inbox`,
      )
      .then((r) => r.rows[0]),
    pool
      .query<{ currency: string; cents: string }>(
        `select coalesce(meta->>'currency', 'usd') as currency, sum((meta->>'amount')::bigint) as cents
         from credit_entry where kind = 'grant' and reason in ('plan', 'pack') and "createdAt" > now() - interval '30 days' and meta ? 'amount' group by 1`,
      )
      .then((r) => r.rows),
    daily(`select ("createdAt" at time zone 'utc')::date as day, count(*) as value from "user" group by 1`),
    daily(`select ("settledAt" at time zone 'utc')::date as day, sum(charged) as value from credit_action where status = 'settled' group by 1`),
    pool
      .query<{ id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; traces: string; total: number | null }>(
        `select u.id, u.name, u.email, u."emailVerified", u."createdAt",
           (select count(*) from trace t where t."userId" = u.id) as traces,
           (select coalesce(sum(l.remaining - l.held), 0)::int from credit_lot l where l."userId" = u.id and l."closedAt" is null and (l."expiresAt" is null or l."expiresAt" > now())) as total
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
    services(),
    paperCopy(),
    marginReport(pool, 30),
    recentActions(pool, 30),
    pool.query<{ day: string; findings: CheckFindings }>(`select day, findings from credit_check order by day desc limit 1`).then((r) => r.rows[0] ?? null),
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
    <AppShell current="admin" title="Admin">
      <PageHead title="Admin">Accounts, usage, revenue, outside services and the contact inbox. Revenue counts paid Polar orders before refunds.</PageHead>

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

      <section className="panel" id="credits" style={{ marginBottom: 22 }}>
        <div className="adm-head">
          <h2>Credits and margin</h2>
          <small>Last 30 days. Revenue at $0.01 a credit; margin is on provider cost. Under {Math.round(MARGIN_ALERT * 100)}% is flagged.</small>
        </div>
        {lastCheck && (
          <p className="small">
            Daily check ({lastCheck.day}):{' '}
            {hasFindings(lastCheck.findings)
              ? [
                  lastCheck.findings.mismatched.length ? `${lastCheck.findings.mismatched.length} balance mismatch(es)` : '',
                  lastCheck.findings.stuckHolds ? `${lastCheck.findings.stuckHolds} stuck hold(s)` : '',
                  ...lastCheck.findings.lowMargin.map((m) => `${REASONS[m.kind] ?? m.kind} at ${Math.round(m.margin * 100)}%`),
                  ...lastCheck.findings.spikes.map((x) => `${x.email ?? x.userId} spent ${x.today} today`),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'all clear.'}
          </p>
        )}
        <div className="adm-table-wrap" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <MarginTable title="By action" rows={margins.kind} label={(k) => REASONS[k] ?? k} />
          <MarginTable title="By model" rows={margins.model} label={(k) => k} />
          <MarginTable title="By plan" rows={margins.plan} label={(k) => k} />
        </div>
        <h3 className="h3" style={{ fontSize: 16, margin: '18px 0 8px' }}>
          Recent paid actions
        </h3>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Steps</th>
                <th>Cost</th>
                <th>Credits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{REASONS[a.kind] ?? a.kind}</b>
                    <small>
                      {timeAgo(new Date(a.createdAt).getTime())} · {a.status === 'held' ? `holding ${a.held}` : (a.outcome ?? 'settled')}
                    </small>
                  </td>
                  <td>
                    <small>{a.email ?? a.userId}</small>
                  </td>
                  <td>
                    <small>{a.lines.length ? a.lines.map((l) => `${l.label || l.kind} $${l.costUsd.toFixed(4)}${l.ok ? '' : ' (failed)'}`).join(' · ') : '—'}</small>
                  </td>
                  <td>${a.costUsd.toFixed(4)}</td>
                  <td>{a.status === 'settled' ? `${a.charged} of ${a.held}` : '—'}</td>
                  <td>{a.status === 'settled' && <RefundAction actionId={a.id} charged={a.charged} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!actions.length && <p className="small">No paid actions yet.</p>}
        </div>
      </section>

      <ProviderHealth rows={serviceRows} hours={SERVICE_HOURS} />
      <PaperCopy stats={copyStats} />

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
    </AppShell>
  );
}

/* One margin table: actions, credits, cost and margin per group. */
function MarginTable({ title, rows, label }: { title: string; rows: MarginRow[]; label: (key: string) => string }) {
  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>{title}</th>
          <th>Credits</th>
          <th>Cost</th>
          <th>Margin</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              <b>{label(r.key)}</b>
              <small>{r.actions.toLocaleString()} actions</small>
            </td>
            <td>{r.credits.toLocaleString()}</td>
            <td>${r.costUsd.toFixed(2)}</td>
            <td style={r.margin != null && r.margin < MARGIN_ALERT ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>{r.margin == null ? '—' : `${Math.round(r.margin * 100)}%`}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={4}>
              <small>Nothing yet.</small>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
