'use client';

import { useState } from 'react';
import type { CreditPack } from '@/lib/polar';
import type { Interval, PlanView } from '@/lib/plans';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import { Icon, type IconName } from '../Icon';
import { BuyButton, FreePlanButton } from './BuyButton';

/* A rough guide for "what does this buy": a typical essay cites about this many claims */
export const CLAIMS_PER_ESSAY = 10;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const perClaim = (cents: number, credits: number, currency: string) =>
  `${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumSignificantDigits: 2 }).format(cents / 100 / (credits / CREDITS_PER_CLAIM))} per claim`;

const ICON: Record<string, IconName> = { free: 'sparkle', scholar: 'book', lab: 'layers' };

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <span className="pr-tick" aria-hidden="true">
        <Icon name="check" />
      </span>
      <span>{children}</span>
    </li>
  );
}

/* The billing switch and the plan cards: Free, then Scholar and Lab (bought in
   Polar, or shown as "coming soon" until they're set up there), then any other
   credit packs that exist in Polar. */
export function PlanPicker({ plans, packs, freeCredits }: { plans: PlanView[]; packs: CreditPack[]; freeCredits: number }) {
  const hasYear = plans.some((p) => p.year);
  const hasMonth = plans.some((p) => p.month);
  const [interval, setInterval] = useState<Interval>(hasMonth ? 'month' : 'year');
  const save = Math.max(0, ...plans.map((p) => p.savePct));

  return (
    <div className="pr-pick">
      {hasYear && hasMonth && (
        <div className="pr-switch" role="radiogroup" aria-label="Billing period" data-on={interval}>
          <span className="pr-switch-thumb" aria-hidden="true" />
          <button type="button" role="radio" aria-checked={interval === 'month'} onClick={() => setInterval('month')}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={interval === 'year'} onClick={() => setInterval('year')}>
            Annually
            {save > 0 && <span className="pr-save">−{save}%</span>}
          </button>
        </div>
      )}

      <div className={`pr-plans n-${1 + plans.length + packs.length}`}>
        <section className="pr-card">
          <div className="pr-card-top">
            <span className="pr-ico">
              <Icon name={ICON.free} />
            </span>
            <h2>Free</h2>
          </div>
          <p className="pr-blurb">For trying Citezeno and the occasional essay.</p>
          <div className="pr-price">
            <span className="pr-amount">$0</span>
            <span className="pr-unit">/ month</span>
          </div>
          <p className="pr-bill">Free forever. No card needed.</p>
          <div className="pr-credits">
            <b>{freeCredits}</b> credits every month
            <small>about {Math.max(1, Math.round(freeCredits / CLAIMS_PER_ESSAY))} essays · refilled on the 1st</small>
          </div>
          <ul className="pr-feats">
            <Feature>All 12 citation styles and 5 output forms</Feature>
            <Feature>Word, PDF, BibTeX, RIS and CSL-JSON</Feature>
            <Feature>Check existing citations, free</Feature>
            <Feature>Library synced to your account</Feature>
          </ul>
          <div className="pr-cta">
            <FreePlanButton />
          </div>
        </section>

        {plans.map((p) => {
          const x = p[interval] || p.month || p.year!;
          const yearly = x === p.year;
          const shown = yearly ? Math.round(x.price / 12) : x.price;
          const monthlyCredits = yearly ? Math.round(x.credits / 12) : x.credits;
          return (
            <section key={p.key} className={`pr-card${p.featured ? ' is-featured' : ''}`}>
              {p.featured && <span className="pr-flag">Best value</span>}
              <div className="pr-card-top">
                <span className="pr-ico">
                  <Icon name={ICON[p.key] || 'bolt'} />
                </span>
                <h2>{p.name}</h2>
              </div>
              <p className="pr-blurb">{p.blurb}</p>
              <div className="pr-price" key={`${p.key}-${interval}`}>
                <span className="pr-amount">{money(shown, x.currency)}</span>
                <span className="pr-unit">/ month</span>
              </div>
              <p className="pr-bill">
                {yearly ? (
                  <>
                    {money(x.price, x.currency)} billed yearly
                    {p.month && p.savePct > 0 && (
                      <>
                        {' '}· <s>{money(p.month.price * 12, x.currency)}</s>
                      </>
                    )}
                  </>
                ) : (
                  'Billed monthly. Cancel any time.'
                )}
              </p>
              <div className="pr-credits">
                <b>{x.credits.toLocaleString()}</b> credits {yearly ? 'a year, added up front' : 'every month'}
                <small>
                  about {Math.round(monthlyCredits / CLAIMS_PER_ESSAY).toLocaleString()} essays a month · {perClaim(x.price, x.credits, x.currency)}
                </small>
              </div>
              <ul className="pr-feats">
                <Feature>Everything in Free</Feature>
                <Feature>{p.featured ? 'Our lowest price per claim' : 'Enough for a full term of coursework'}</Feature>
                <Feature>Unused credits roll over and never expire</Feature>
                <Feature>Cancel any time from your account</Feature>
              </ul>
              <div className="pr-cta">
                {p.preview ? (
                  // not set up in Polar yet: same look as the real button, inactive
                  <button type="button" className={`btn ${p.featured ? 'btn-thread' : 'btn-ghost'} pr-off`} disabled title="Checkout isn’t set up yet">
                    Get {p.name}{yearly ? ' yearly' : ''}
                  </button>
                ) : (
                  <BuyButton productId={x.productId} featured={p.featured} label={`Get ${p.name}${yearly ? ' yearly' : ''}`} />
                )}
              </div>
            </section>
          );
        })}

        {packs.map((p) => (
          <section key={p.id} className="pr-card">
            <div className="pr-card-top">
              <span className="pr-ico">
                <Icon name="bolt" />
              </span>
              <h2>{p.name}</h2>
            </div>
            <p className="pr-blurb">A one-time top-up for plan members.</p>
            <div className="pr-price">
              <span className="pr-amount">{money(p.price, p.currency)}</span>
            </div>
            <p className="pr-bill">One payment. No subscription.</p>
            <div className="pr-credits">
              <b>{p.credits.toLocaleString()}</b> credits
              <small>{perClaim(p.price, p.credits, p.currency)}</small>
            </div>
            <ul className="pr-feats">
              <Feature>Needs an active plan</Feature>
              <Feature>Credits last 12 months</Feature>
            </ul>
            <div className="pr-cta">
              <BuyButton productId={p.id} featured={false} label={`Buy ${p.credits.toLocaleString()} credits`} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
