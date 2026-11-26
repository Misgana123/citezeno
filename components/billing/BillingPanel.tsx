'use client';

import Link from 'next/link';
import { nearLimit, type UsageRow } from '@/lib/credits/usage';
import { REASONS, type Balance, type LedgerRow } from '@/lib/pricing';
import { timeAgo } from '@/lib/library';
import { useCredits } from '../useCredits';
import { PortalButton } from './BuyButton';

type PlanInfo = { name: string; interval: 'month' | 'year'; periodEnd: string | null; cancelAtPeriodEnd: boolean } | null;

const amount = (r: UsageRow, n: number) =>
  r.unit === 'bytes' ? (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`) : n.toLocaleString();

export function BillingPanel({ initial, history, polar, plan, usage }: { initial: Balance; history: LedgerRow[]; polar: boolean; plan: PlanInfo; usage: UsageRow[] }) {
  const b = useCredits() ?? initial;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <section className="panel" id="billing">
      <h2>Credits and billing</h2>
      <p>
        {plan ? (
          <>
            You’re on <b>{plan.name}</b>, billed {plan.interval === 'year' ? 'yearly' : 'monthly'}
            {plan.periodEnd && <>{plan.cancelAtPeriodEnd ? ', ending' : ', renewing'} on {day(plan.periodEnd)}</>}.{' '}
          </>
        ) : (
          <>You don’t have a plan. Your work stays here; choose a plan to trace, ask the assistant or use the reader’s AI. </>
        )}
        Credits come in batches that each have an end date, and the batch that ends soonest is used first.
      </p>
      <div className="stats">
        <div className="stat">
          <b>{b.total.toLocaleString()}</b>
          <span>Credits available</span>
        </div>
        <div className="stat">
          <b>{b.held.toLocaleString()}</b>
          <span>On hold</span>
        </div>
        <div className="stat">
          <b>{b.nextExpiry ? b.nextExpiry.amount.toLocaleString() : '—'}</b>
          <span>{b.nextExpiry ? `End on ${day(b.nextExpiry.at)}` : 'Nothing ending soon'}</span>
        </div>
      </div>
      {b.lots.length > 0 && (
        <ul className="ledger" style={{ marginBottom: 18 }}>
          {b.lots.map((l) => (
            <li key={l.id}>
              <span>
                {l.label}
                <small>{l.expiresAt ? `until ${day(l.expiresAt)}` : 'never expires'}</small>
              </span>
              <span>{(l.remaining - l.held).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="actions" style={{ marginBottom: history.length ? 22 : 0 }}>
        <Link className="btn btn-thread btn-sm" href="/pricing">
          {plan ? 'Plans and top-ups' : 'Choose a plan'}
        </Link>
        {polar && <PortalButton />}
      </div>
      {usage.length > 0 && (
        <>
          <h3 className="h3" style={{ fontSize: 16, marginBottom: 8 }}>
            Your plan’s limits
          </h3>
          <ul className="ledger" style={{ marginBottom: 22 }}>
            {usage.map((r) => {
              const pct = r.limit > 0 ? Math.min(100, (r.used / r.limit) * 100) : 0;
              const warn = nearLimit(r);
              return (
                <li key={r.key} style={{ display: 'block' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>
                      {r.label}
                      {warn && <small>{r.used >= r.limit ? 'limit reached' : 'nearly at the limit'}</small>}
                    </span>
                    <span>
                      {amount(r, r.used)} / {amount(r, r.limit)}
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ display: 'block', height: 4, borderRadius: 2, marginTop: 6, background: 'var(--rule)' }}>
                    <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 2, background: warn ? 'var(--thread)' : 'var(--ink-3)' }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h3 className="h3" style={{ fontSize: 16, marginBottom: 8 }}>
            Recent activity
          </h3>
          <ul className="ledger">
            {history.map((r) => (
              <li key={r.id}>
                <span>
                  {r.kind === 'expire' ? REASONS.expire : REASONS[r.reason] || r.reason}
                  {r.reason === 'trace' && typeof r.meta.claims === 'number' ? ` (${r.meta.claims} claims)` : ''}
                  {(r.reason === 'pack' || r.reason === 'plan') && typeof r.meta.product === 'string' ? `: ${r.meta.product}` : ''}
                  {r.kind === 'charge' && typeof r.meta.held === 'number' && r.meta.held > -r.delta && ' · unused returned'}
                  <small>{timeAgo(new Date(r.createdAt).getTime())}</small>
                </span>
                <span className={r.delta > 0 ? 'plus' : 'minus'}>
                  {r.delta > 0 ? '+' : '−'}
                  {Math.abs(r.delta).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
