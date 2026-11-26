'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

export type TourItem = { key: string; icon: IconName; name: string; desc: string; url: string; cap: string; screen: ReactNode };

/* How long each tool stays on stage before the tour moves on. */
const DWELL_MS = 7000;

/* The product tour: a list of tools on the left and a window on a blue stage
   showing the chosen one. It moves to the next tool on its own (paused while
   the pointer is over it, and off with reduced motion); clicking picks one. */
export function ProductTour({ items }: { items: TourItem[] }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => {
    if (paused || still) return;
    const t = window.setTimeout(() => setAt((i) => (i + 1) % items.length), DWELL_MS);
    return () => window.clearTimeout(t);
  }, [at, paused, still, items.length]);

  const cur = items[at];
  return (
    <div className={`lp-tour${paused ? ' is-paused' : ''}`} style={{ ['--lp-dwell' as string]: `${DWELL_MS}ms` }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="lp-tabs" role="tablist" aria-label="Citezeno tools">
        {items.map((it, i) => (
          <button key={it.key} type="button" role="tab" id={`lp-tab-${it.key}`} aria-controls={`lp-pane-${it.key}`} aria-selected={i === at} className="lp-tab" onClick={() => setAt(i)}>
            <span className="lp-ico"><Icon name={it.icon} /></span>
            <b>{it.name}</b>
            <span className="lp-tab-d">{it.desc}</span>
            {/* the key restarts the progress bar each time a tab is chosen */}
            <span className="lp-tab-bar" aria-hidden="true"><i key={i === at ? `on-${at}` : 'off'} /></span>
          </button>
        ))}
      </div>
      <div className="lp-stage">
        <div className="lp-win">
          <div className="lp-win-bar" aria-hidden="true"><i /><i /><i /><span>citezeno.com{cur.url}</span></div>
          {items.map((it, i) => (
            <div key={it.key} className="lp-pane" role="tabpanel" id={`lp-pane-${it.key}`} aria-labelledby={`lp-tab-${it.key}`} hidden={i !== at}>
              {it.screen}
            </div>
          ))}
        </div>
        <div className="lp-stage-cap">
          <span><b>{cur.name}.</b> {cur.cap}</span>
          <span>{items.length} tools · 1 credit balance</span>
        </div>
      </div>
    </div>
  );
}
