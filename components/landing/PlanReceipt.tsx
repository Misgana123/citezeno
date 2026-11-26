'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon, LogoMark } from '@/components/Icon';

export type ReceiptPlan = { key: string; name: string; blurb: string; featured: boolean; month: string; year: string; lines: [string, string][] };

/* Landing pricing: the three plans as a radio list, and a paper receipt that
   itemises the chosen one. Figures come from lib/plans.ts via the page. */
export function PlanReceipt({ plans, intro, more }: { plans: ReceiptPlan[]; intro: ReactNode; more: ReactNode }) {
  const [key, setKey] = useState(plans.find((p) => p.featured)?.key ?? plans[0].key);
  const p = plans.find((x) => x.key === key)!;
  return (
    <div className="lp-price">
      <div>
        {intro}
        <div className="lp-plans" role="radiogroup" aria-label="Plan">
        {plans.map((x) => (
          <button key={x.key} type="button" role="radio" aria-checked={x.key === key} className="lp-plan-btn" onClick={() => setKey(x.key)}>
            <span className="lp-radio" aria-hidden="true" />
            <span>
              <b>
                {x.name}
                {x.featured && <small>Most popular</small>}
              </b>
              <span>{x.blurb}</span>
            </span>
            <span className="lp-plan-p">{x.month}</span>
          </button>
        ))}
        </div>
        {more}
      </div>
      <div className="lp-receipt" aria-live="polite">
        <div className="lp-rcp-in" key={p.key}>
          <div className="lp-rcp-h">
            <LogoMark />
            <b>CITEZENO</b>
            <small>RESEARCH RECEIPT · MONTHLY</small>
          </div>
          <div className="lp-rcp-plan">
            <em>{p.name}</em>
            <small>{p.blurb}</small>
          </div>
          <dl className="lp-rcp-lines">
            {p.lines.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
          <div className="lp-rcp-tot">
            <span>TOTAL</span>
            <b>
              {p.month}
              <small> /mo</small>
            </b>
          </div>
          <p className="lp-rcp-note">{p.year} a year if billed yearly · cancel any time</p>
          <Link className="btn btn-thread" href="/pricing">
            Choose {p.name} <Icon name="arrow" />
          </Link>
          <div className="lp-rcp-bar" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
