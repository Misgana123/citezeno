'use client';

import { useState } from 'react';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';

type Tier = { key: string; name: string; credits: number };

const LENGTHS = [
  { id: 'short', label: 'Short', claims: 5, hint: 'a page or two' },
  { id: 'essay', label: 'Essay', claims: 10, hint: 'around 1,500 words' },
  { id: 'paper', label: 'Paper', claims: 25, hint: 'a long paper or chapter' },
] as const;

/* "Which plan fits?": essays a month × claims per essay → credits → the
   smallest plan that covers it. A guide, not a promise. */
export function PlanEstimator({ tiers }: { tiers: Tier[] }) {
  const [essays, setEssays] = useState(4);
  const [len, setLen] = useState<(typeof LENGTHS)[number]['id']>('essay');
  const claims = LENGTHS.find((l) => l.id === len)!.claims;
  const need = essays * claims * CREDITS_PER_CLAIM;
  const sorted = [...tiers].sort((a, b) => a.credits - b.credits);
  const fit = sorted.find((t) => t.credits >= need) || sorted[sorted.length - 1];
  const over = need > fit.credits;

  return (
    <section className="pr-est" aria-labelledby="est-title">
      <div className="pr-est-copy">
        <span className="kicker">Which plan fits?</span>
        <h2 id="est-title">
          Work out what you’d <em>actually use.</em>
        </h2>
        <p>One credit covers one claim. Tell us roughly how much you write and we’ll suggest a plan.</p>
      </div>
      <div className="pr-est-panel">
        <label className="pr-est-row">
          <span>
            Pieces a month <b>{essays}</b>
          </span>
          <input
            type="range"
            min={1}
            max={40}
            value={essays}
            onChange={(e) => setEssays(+e.target.value)}
            style={{ ['--p' as string]: `${((essays - 1) / 39) * 100}%` } as React.CSSProperties}
            aria-valuetext={`${essays} pieces a month`}
          />
        </label>
        <div className="pr-est-row">
          <span>How long is each?</span>
          <div className="pr-est-len" role="radiogroup" aria-label="Length of each piece">
            {LENGTHS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={len === l.id} onClick={() => setLen(l.id)}>
                <b>{l.label}</b>
                <small>~{l.claims} claims · {l.hint}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="pr-est-out" aria-live="polite">
          <div>
            <small>You’d use about</small>
            <b>{need.toLocaleString()}</b>
            <small>credits a month</small>
          </div>
          <div className="pr-est-arrow" aria-hidden="true">→</div>
          <div className="pr-est-fit">
            <small>{over ? 'Closest fit' : 'Your best fit'}</small>
            <b>{fit.name}</b>
            <small>{fit.credits.toLocaleString()} credits a month{over ? ' · you may run short in your busiest months' : ''}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
