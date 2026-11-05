'use client';

import Link from 'next/link';
import { REASONS, type Balance, type LedgerRow } from '@/lib/pricing';
import { timeAgo } from '@/lib/library';
import { useCredits } from '../useCredits';
import { PortalButton } from './BuyButton';

export function BillingPanel({ initial, history, polar }: { initial: Balance; history: LedgerRow[]; polar: boolean }) {
  const b = useCredits() ?? initial;
  const reset = new Date(b.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return (
    <section className="panel" id="billing">
      <h2>Credits and billing</h2>
      <p>One credit traces one claim. Free credits are used first and refill on {reset}; purchased credits never expire.</p>
      <div className="stats">
        <div className="stat">
          <b>{b.total.toLocaleString()}</b>
          <span>Credits available</span>
        </div>
        <div className="stat">
          <b>
            {b.free}
            <small style={{ fontSize: 14, color: 'var(--ink-3)' }}> / {b.freeMonthly}</small>
          </b>
          <span>Free this month</span>
        </div>
        <div className="stat">
          <b>{b.paid.toLocaleString()}</b>
          <span>Purchased</span>
        </div>
      </div>
      <div className="actions" style={{ marginBottom: history.length ? 22 : 0 }}>
        <Link className="btn btn-thread btn-sm" href="/pricing">
          Buy credits
        </Link>
        {polar && <PortalButton />}
      </div>
      {history.length > 0 && (
        <>
          <h3 className="h3" style={{ fontSize: 16, marginBottom: 8 }}>
            Recent activity
          </h3>
          <ul className="ledger">
            {history.map((r) => (
              <li key={r.id}>
                <span>
                  {REASONS[r.reason] || r.reason}
                  {r.reason === 'trace' && typeof r.meta.claims === 'number' ? ` (${r.meta.claims} claims)` : ''}
                  {r.reason === 'purchase' && typeof r.meta.product === 'string' ? `: ${r.meta.product}` : ''}
                  {r.refunded && ' · returned'}
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
