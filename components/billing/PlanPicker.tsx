'use client';

import { useState } from 'react';
import type { CreditPack } from '@/lib/polar';
import type { Interval, PlanView } from '@/lib/plans';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import { Icon } from '../Icon';
import { BuyButton, FreePlanButton } from './BuyButton';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const perClaim = (cents: number, credits: number, currency: string) =>
  `${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumSignificantDigits: 2 }).format(cents / 100 / (credits / CREDITS_PER_CLAIM))} per claim`;

/* Free, then the Scholar and Lab plans with a Monthly / Annually switch, then
   any other credit packs set up in Polar. */
export function PlanPicker({ plans, packs, freeCredits }: { plans: PlanView[]; packs: CreditPack[]; freeCredits: number }) {
  const hasYear = plans.some((p) => p.year);
  const hasMonth = plans.some((p) => p.month);
  const [interval, setInterval] = useState<Interval>(hasMonth ? 'month' : 'year');
  const save = Math.max(0, ...plans.map((p) => p.savePct));

  return (
    <>
      {hasYear && hasMonth && (
        <div className="bill-switch" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={interval === 'month'} onClick={() => setInterval('month')}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={interval === 'year'} onClick={() => setInterval('year')}>
            Annually
            {save > 0 && <span className="bill-save">Save {save}%</span>}
          </button>
        </div>
      )}

      <div className="plans">
        <section className="plan">
          <h2>Free</h2>
          <p className="desc">For trying Citezeno and the occasional essay.</p>
          <div className="amount">
            $0 <small>/ month</small>
          </div>
          <div className="per">{freeCredits} credits every month</div>
          <ul>
            <li><Icon name="check" /> All 12 citation styles</li>
            <li><Icon name="check" /> Word, PDF, BibTeX and RIS export</li>
            <li><Icon name="check" /> Library synced to your account</li>
          </ul>
          <FreePlanButton />
        </section>

        {plans.map((p) => {
          // show the chosen interval, or the only one this plan has
          const x = p[interval] || p.month || p.year!;
          const yearly = x === p.year;
          return (
            <section key={p.key} className={`plan${p.featured ? ' featured' : ''}`}>
              {p.featured && <span className="flag">Best value</span>}
              <h2>{p.name}</h2>
              <p className="desc">{p.blurb}</p>
              <div className="amount">
                {money(yearly ? Math.round(x.price / 12) : x.price, x.currency)} <small>/ month</small>
              </div>
              <div className="per">
                {yearly ? (
                  <>
                    Billed {money(x.price, x.currency)} yearly
                    {p.month && p.savePct > 0 && (
                      <>
                        {' '}instead of <s className="plan-was">{money(p.month.price * 12, x.currency)}</s>
                      </>
                    )}
                  </>
                ) : (
                  'Billed monthly'
                )}
              </div>
              <div className="plan-credits">
                <b>{x.credits.toLocaleString()}</b> credits {yearly ? 'a year, added up front' : 'every month'}
                <span>{perClaim(x.price, x.credits, x.currency)}</span>
              </div>
              <ul>
                <li><Icon name="check" /> Everything in Free</li>
                <li><Icon name="check" /> Unused credits roll over and never expire</li>
                <li><Icon name="check" /> Cancel any time</li>
              </ul>
              <BuyButton productId={x.productId} featured={p.featured} label={`Get ${p.name} ${yearly ? 'yearly' : 'monthly'}`} />
            </section>
          );
        })}

        {packs.map((p) => (
          <section key={p.id} className={`plan${p.featured ? ' featured' : ''}`}>
            {p.featured && !plans.length && <span className="flag">Best value</span>}
            <h2>{p.name}</h2>
            <p className="desc">{p.description || (p.recurring ? 'Credits added every billing period.' : 'A one-time top-up.')}</p>
            <div className="amount">
              {money(p.price, p.currency)} {p.recurring && <small>/ {p.recurring}</small>}
            </div>
            <div className="per">
              {p.credits.toLocaleString()} credits{p.recurring ? ` every ${p.recurring}` : ''} · {perClaim(p.price, p.credits, p.currency)}
            </div>
            <ul>
              <li><Icon name="check" /> Everything in Free</li>
              <li><Icon name="check" /> {p.recurring ? 'Unused credits roll over' : 'Credits never expire'}</li>
              <li><Icon name="check" /> {p.recurring ? 'Cancel any time' : 'No subscription'}</li>
            </ul>
            <BuyButton productId={p.id} featured={p.featured} label={p.recurring ? 'Subscribe' : `Buy ${p.credits.toLocaleString()} credits`} />
          </section>
        ))}
      </div>
    </>
  );
}
