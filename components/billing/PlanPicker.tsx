'use client';

import { useState } from 'react';
import type { CreditPack } from '@/lib/polar';
import { PLANS, type Interval, type PlanKey, type PlanView } from '@/lib/plans';
import { Icon, type IconName } from '../Icon';
import { BuyButton } from './BuyButton';

/* A rough guide for "what does this buy": a typical essay cites about this many claims */
export const CLAIMS_PER_ESSAY = 10;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const ICON: Record<string, IconName> = { starter: 'sparkle', scholar: 'book', lab: 'layers' };

const size = (bytes: number) => (bytes >= 1024 ** 3 ? `${Math.round(bytes / 1024 ** 3)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
const every = (days: number | null) => (days == null ? null : days <= 1 ? 'daily' : days <= 7 ? 'weekly' : 'monthly');

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
    l.researchBudgetCap ? `Deep research, up to ${l.researchBudgetCap} credits a run` : 'No deep research',
    `${size(l.pdfStorageBytes)} of PDFs, ${l.shelfPapers.toLocaleString()} papers on your shelf`,
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

      <div className={`pr-plans n-${plans.length}`}>
        {plans.map((p) => {
          const x = p[interval] || p.month || p.year!;
          const yearly = x === p.year;
          const shown = yearly ? Math.round(x.price / 12) : x.price;
          return (
            <section key={p.key} className={`pr-card${p.featured ? ' is-featured' : ''}`}>
              {p.featured && <span className="pr-flag">Most popular</span>}
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
                <b>{p.monthlyCredits.toLocaleString()}</b> credits every month
                <small>
                  about {Math.round(p.monthlyCredits / CLAIMS_PER_ESSAY).toLocaleString()} essays traced · each month’s credits end with the month
                </small>
              </div>
              <ul className="pr-feats">
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
