'use client';

import Link from 'next/link';
import { nearLimit, type UsageRow } from '@/lib/credits/usage';
import { REASONS } from '@/lib/pricing';
import { Icon } from '../../Icon';
import { PortalButton } from '../../billing/BuyButton';
import { useCredits } from '../../useCredits';
import { useLab } from '../../labs/useLab';
import { openSettings } from '../open';
import type { AccountState } from '../useAccount';
import { longDate, shortDate } from './shared';

const amount = (r: UsageRow, n: number) => (r.unit === 'bytes' ? (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`) : n.toLocaleString());

/* Credits and usage: the plan, what's left, the plan's limits, and where credits went. */
export function UsageSection({ account }: { account: AccountState }) {
  const a = account.data!;
  const b = useCredits() ?? a.balance;
  const plan = a.plan;
  return (
    <section>
      <h3>Credits and usage</h3>
      <p className="st-lead">Your plan, what’s left, and where your credits went. Credits come in batches that each have an end date; the batch that ends soonest is used first.</p>

      <div className="st-group">
        <div className="st-box">
          <div className="st-line st-wrap">
            <div className="st-txt">
              <b>
                {plan ? plan.name : 'No plan'}
                {plan && <span className="st-tag">{plan.interval === 'year' ? 'Yearly' : 'Monthly'}</span>}
              </b>
              <small>
                {plan
                  ? plan.periodEnd
                    ? `${plan.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on ${longDate(plan.periodEnd)}`
                    : 'Active'
                  : 'Your work stays here. Choose a plan to trace, ask the assistant or use the reader’s AI.'}
              </small>
            </div>
            {a.polar && <PortalButton className="st-btn" />}
            <Link className="st-btn is-dark" href="/pricing">
              <Icon name="bolt" />
              {plan ? 'Plans and top-ups' : 'Choose a plan'}
            </Link>
          </div>
        </div>
      </div>

      <LabPool userId={a.user.id} />

      <div className="st-group">
        <div className="st-stats">
          <div className="st-stat">
            <b>{b.total.toLocaleString()}</b>
            <span>Credits available</span>
          </div>
          <div className="st-stat">
            <b>{b.held.toLocaleString()}</b>
            <span>Held for running work</span>
          </div>
          <div className="st-stat">
            <b>{b.nextExpiry ? b.nextExpiry.amount.toLocaleString() : '—'}</b>
            <span>{b.nextExpiry ? `End on ${shortDate(b.nextExpiry.at)}` : 'Nothing ending soon'}</span>
          </div>
        </div>
      </div>

      {b.lots.length > 0 && (
        <div className="st-group">
          <h4>Your credits</h4>
          <div className="st-box">
            {b.lots.map((l) => (
              <div className="st-line" key={l.id}>
                <div className="st-txt">
                  <b>{l.label}</b>
                  <small>{l.expiresAt ? `until ${longDate(l.expiresAt)}` : 'never expires'}</small>
                </div>
                <span>{(l.remaining - l.held).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.usage.length > 0 && (
        <div className="st-group">
          <h4>Your plan’s limits</h4>
          <div className="st-box">
            {a.usage.map((r) => {
              const pct = r.limit > 0 ? Math.min(100, (r.used / r.limit) * 100) : 0;
              const warn = nearLimit(r);
              return (
                <div className="st-meter" key={r.key}>
                  <div className="st-meter-top">
                    {r.label}
                    {warn ? ` · ${r.used >= r.limit ? 'limit reached' : 'nearly at the limit'}` : ''}
                    <span>
                      {amount(r, r.used)} / {amount(r, r.limit)}
                    </span>
                  </div>
                  <div className="st-track">
                    <i className={warn ? 'is-warn' : undefined} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {a.history.length > 0 && (
        <div className="st-group">
          <h4>Recent activity</h4>
          <div className="st-box">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th className="num">Credits</th>
                </tr>
              </thead>
              <tbody>
                {a.history.map((r) => (
                  <tr key={r.id}>
                    <td>{shortDate(r.createdAt)}</td>
                    <td>
                      {r.kind === 'expire' ? REASONS.expire : REASONS[r.reason] || r.reason}
                      {r.reason === 'trace' && typeof r.meta.claims === 'number' ? ` (${r.meta.claims} claims)` : ''}
                      {(r.reason === 'pack' || r.reason === 'plan') && typeof r.meta.product === 'string' ? `: ${r.meta.product}` : ''}
                      {r.kind === 'charge' && typeof r.meta.held === 'number' && r.meta.held > -r.delta && ' · unused returned'}
                    </td>
                    <td className={`num${r.delta > 0 ? ' plus' : ''}`}>
                      {r.delta > 0 ? '+' : '−'}
                      {Math.abs(r.delta).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* In a lab: lab work is paid from the owner's credits, up to your monthly cap. */
function LabPool({ userId }: { userId: string }) {
  const { lab } = useLab();
  if (!lab?.lab || lab.role === 'guest') return null;
  const me = lab.members.find((m) => m.userId === userId);
  const owner = lab.members.find((m) => m.role === 'owner');
  return (
    <div className="st-group">
      <div className="st-box">
        <div className="st-line st-wrap">
          <div className="st-txt">
            <b>
              Lab: {lab.lab.name}
              <span className="st-tag">{lab.role === 'owner' ? 'Your plan pays' : `Paid by ${owner?.name ?? 'the owner'}`}</span>
            </b>
            <small>
              Chats in the lab’s projects use {lab.role === 'owner' ? 'your' : 'the lab’s'} credits
              {me?.usedThisMonth != null ? `: ${me.usedThisMonth.toLocaleString('en-US')} this month` : ''}
              {me?.creditCap != null ? ` of your ${me.creditCap.toLocaleString('en-US')} cap; past it, your own credits are used.` : '.'}
            </small>
          </div>
          <button type="button" className="st-btn" onClick={() => openSettings('lab')}>
            Open the lab
          </button>
        </div>
      </div>
    </div>
  );
}
