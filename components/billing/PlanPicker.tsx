'use client';

import { useState } from 'react';
import type { CreditPack } from '@/lib/polar';
import { PLANS, type Interval, type PlanKey, type PlanView } from '@/lib/plans';
import { everyLabel, sizeLabel } from '@/lib/plan-lines';
import { Icon } from '../Icon';
import { BuyButton } from './BuyButton';

/* A rough guide for "what does this buy": a typical essay cites about this many claims */
export const CLAIMS_PER_ESSAY = 10;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

/* the currency sign and the number apart, so the sign can sit small beside a large figure */
const moneyParts = (cents: number, currency: string) => {
  const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).formatToParts(cents / 100);
  return { symbol: parts.filter((x) => x.type === 'currency').map((x) => x.value).join(''), amount: parts.filter((x) => x.type !== 'currency' && x.type !== 'literal').map((x) => x.value).join('') };
};

const size = sizeLabel;
const every = everyLabel;

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

/* What a plan gives beyond its credits, from its limits (lib/plans.ts). */
function features(key: PlanKey): string[] {
  const l = PLANS[key].limits;
  const models = l.tiers.includes('premium') ? 'Every assistant model, Premium included' : 'Economy and Standard assistant models';
  return [
    models,
    l.researchBudgetCap ? 'Deep research reports' : 'No deep research',
    `${l.shelfPapers.toLocaleString()} papers on your shelf`,
    `${size(l.pdfStorageBytes)} of PDF storage`,
    `${l.searchesPerDay} paper searches a day${every(l.shelfRefreshDays) ? `, shelf refreshed ${every(l.shelfRefreshDays)}` : ''}`,
  ];
}

/* The billing switch and the plan cards (bought in Polar, or shown as "coming
   soon" until they're set up there), then the top-ups for plan members. */
export function PlanPicker({ plans, packs }: { plans: PlanView[]; packs: CreditPack[] }) {
  const hasYear = plans.some((p) => p.year);
  const hasMonth = plans.some((p) => p.month);
  const [interval, setInterval] = useState<Interval>(hasMonth ? 'month' : 'year');
  const save = Math.max(0, ...plans.map((p) => p.savePct));
  const mostCredits = Math.max(1, ...plans.map((p) => p.monthlyCredits));

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

      {/* the rate card: one sheet, a column per plan, the featured one lifted out */}
      <div className={`pr-rate n-${plans.length}`}>
        {plans.map((p, i) => {
          const x = p[interval] || p.month || p.year!;
          const yearly = x === p.year;
          const shown = yearly ? Math.round(x.price / 12) : x.price;
          const { symbol, amount } = moneyParts(shown, x.currency);
          return (
            <section key={p.key} className={`pr-rcol${p.featured ? ' is-featured' : ''}`}>
              {p.featured && <span className="pr-rflag">Most popular</span>}
              <div className="pr-rname">
                <h2>{p.name}</h2>
                <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <p className="pr-rblurb">{p.blurb}</p>
              <div className="pr-rprice" key={`${p.key}-${interval}`}>
                <span className="pr-rcur">{symbol}</span>
                <b>{amount}</b>
                <span className="pr-rper">/ month</span>
              </div>
              <p className="pr-rbill">
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
              <div className="pr-rcredits">
                <div className="pr-rcredits-top">
                  <b>{p.monthlyCredits.toLocaleString()}</b>
                  <span>credits every month</span>
                </div>
                <div className="pr-rmeter" aria-hidden="true">
                  <i style={{ width: `${(p.monthlyCredits / mostCredits) * 100}%` }} />
                </div>
                <small>about {Math.round(p.monthlyCredits / CLAIMS_PER_ESSAY).toLocaleString()} essays traced · each month’s credits end with the month</small>
              </div>
              <ul className="pr-feats pr-rfeats">
                {features(p.key).map((f) => (
                  <Feature key={f}>{f}</Feature>
                ))}
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
      </div>

      {packs.length > 0 && (
        <>
          <h3 className="h3" style={{ textAlign: 'center', margin: '36px 0 14px' }}>
            Top-ups for plan members
          </h3>
          <div className={`pr-plans n-${packs.length}`}>
            {packs.map((p) => (
              <section key={p.id} className="pr-card">
                <div className="pr-card-top">
                  <span className="pr-ico">
                    <Icon name="bolt" />
                  </span>
                  <h2>{p.name}</h2>
                </div>
                <div className="pr-price">
                  <span className="pr-amount">{money(p.price, p.currency)}</span>
                </div>
                <p className="pr-bill">One payment. Credits last 12 months.</p>
                <div className="pr-cta">
                  <BuyButton productId={p.id} featured={false} label={`Buy ${p.credits.toLocaleString()} credits`} />
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
