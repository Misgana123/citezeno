import type { Metadata } from 'next';
import Link from 'next/link';
import { ClearHistory } from '@/components/history/ClearHistory';
import { Icon, type IconName } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { FILTERS, describe, loadHistory, type HistoryFilter, type HistoryItem } from '@/lib/history';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'History', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ICON: Record<string, IconName> = {
  'trace.created': 'search', 'trace.renamed': 'wand', 'trace.deleted': 'trash', 'trace.shared': 'globe', 'trace.unshared': 'globe',
  'auth.signin': 'device', 'auth.password': 'lock', 'auth.2fa-on': 'shield', 'auth.2fa-off': 'shield', 'contact.sent': 'mail',
};
const iconFor = (k: string): IconName => ICON[k] || (k.startsWith('credits.') ? 'bolt' : 'history');

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export default async function HistoryPage({ searchParams }: Props) {
  const session = await requireSession('/history');
  const sp = await searchParams;
  const filter = (FILTERS.some((f) => f.id === sp.type) ? sp.type : 'all') as HistoryFilter;
  const before = typeof sp.before === 'string' ? sp.before : null;
  const { items, next } = await loadHistory(session.user.id, { filter, before });

  const groups: [string, HistoryItem[]][] = [];
  for (const it of items) {
    const label = dayLabel(it.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(it);
    else groups.push([label, [it]]);
  }
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (o.type && o.type !== 'all') p.set('type', o.type);
    if (o.before) p.set('before', o.before);
    const s = p.toString();
    return `/history${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head hist-head">
          <div>
            <h1 className="h2">History</h1>
            <p className="lede">Everything you’ve done in Citezeno: traces, credits, sharing and sign-ins, newest first.</p>
          </div>
          <div className="hist-tools">
            <a className="btn btn-ghost btn-sm" href="/api/history" download>
              <Icon name="download" /> Download CSV
            </a>
            <ClearHistory />
          </div>
        </header>

        <nav className="hist-filters" aria-label="Filter history">
          {FILTERS.map((f) => (
            <Link key={f.id} href={q({ type: f.id })} aria-current={filter === f.id ? 'page' : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>

        {!items.length ? (
          <div className="lib-empty">
            <Icon name="history" />
            <h2 className="h3">{before ? 'No older activity' : 'Nothing here yet'}</h2>
            <p>{filter === 'all' ? 'Run a trace in the studio and it will show up here.' : 'No activity of this kind yet.'}</p>
            <Link className="btn btn-thread" href="/studio">
              Open the studio
            </Link>
          </div>
        ) : (
          <ol className="hist">
            {groups.map(([label, list]) => (
              <li key={label} className="hist-day">
                <h2 className="hist-day-title">{label}</h2>
                <ol>
                  {list.map((it) => {
                    const d = describe(it);
                    return (
                      <li key={it.id} className={`hist-item k-${it.kind.split('.')[0]}`}>
                        <span className="hist-ico" aria-hidden="true">
                          <Icon name={iconFor(it.kind)} />
                        </span>
                        <div className="hist-body">
                          <p>
                            {d.text}
                            {it.title && (
                              <>
                                {' '}
                                {it.traceExists ? (
                                  <Link href={`/studio?open=${encodeURIComponent(it.traceId!)}`}>“{it.title}”</Link>
                                ) : (
                                  <b>“{it.title}”</b>
                                )}
                              </>
                            )}
                          </p>
                          <small>
                            {new Date(it.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {d.detail ? ` · ${d.detail}` : ''}
                          </small>
                        </div>
                        {it.delta != null && (
                          <span className={`hist-delta ${it.delta > 0 ? 'plus' : 'minus'}`}>
                            {it.delta > 0 ? '+' : '−'}
                            {Math.abs(it.delta).toLocaleString()}
                            <small> credit{Math.abs(it.delta) === 1 ? '' : 's'}</small>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        )}

        {(next || before) && (
          <div className="hist-pager">
            {before && (
              <Link className="btn btn-ghost btn-sm" href={q({ type: filter })}>
                Back to newest
              </Link>
            )}
            {next && (
              <Link className="btn btn-ghost btn-sm" href={q({ type: filter, before: next })}>
                Older activity
              </Link>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
