'use client';

import Link from 'next/link';
import { REASONS, type Balance, type LedgerRow } from '@/lib/pricing';
import { timeAgo } from '@/lib/library';
import { useCredits } from '../useCredits';
import { PortalButton } from './BuyButton';

export function BillingPanel({ initial, history, polar }: { initial: Balance; history: LedgerRow[]; polar: boolean }) {
  const b = useCredits() ?? initial;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <section className="panel" id="billing">
      <h2>Credits and billing</h2>
      <p>Credits come in batches that each have an end date. The batch that ends soonest is always used first.</p>
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
          Plans and credits
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
