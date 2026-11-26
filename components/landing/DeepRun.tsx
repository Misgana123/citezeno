'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

/* The steps a deep research run really takes (lib/agent/research.ts):
   plan 3–5 sub-questions, search papers and the web for each, read the best
   pages, look for what's missing, then write the report. A run stops
   researching by 3 minutes and has 4 at most, so the clock stays under that. */
const STEPS: { title: string; body: string; at: string; tags?: string[] }[] = [
  { title: 'Planning the research', body: 'Split into 4 sub-questions: canopy cooling, heat mortality, who is most exposed, what cities did.', at: '0:06' },
  { title: 'Searching', body: 'Papers and the web for each sub-question, three at a time.', at: '0:52', tags: ['Papers', 'Web', 'Retracted works left out'] },
  { title: 'Reading', body: 'The two best pages for each question, and the abstracts of the papers found.', at: '1:58', tags: ['8 pages', '15 papers'] },
  { title: 'Checking what’s missing', body: 'Added 2 follow-up questions and searched again.', at: '2:40' },
  { title: 'Writing the report', body: 'Summary, sections, limits and numbered sources.', at: '3:35' },
];

/* The deep research panel: the run plays step by step, ends on the finished
   report, pauses, and starts again. Reduced motion shows the finished run. */
export function DeepRun() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STEPS.length);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => (s > STEPS.length ? 0 : s + 1)), step === STEPS.length ? 3200 : 1500);
    return () => window.clearTimeout(t);
  }, [step]);

  const done = step >= STEPS.length;
  return (
    <div className="lp-run" aria-label="An example deep research run">
      <div className="lp-run-top">
        <div>
          <small>DEEP RESEARCH</small>
          <b>Do urban trees reduce heat-related deaths?</b>
        </div>
        <span className="lp-live"><i aria-hidden="true" /> {done ? `Done · ${STEPS[STEPS.length - 1].at}` : `Running · ${STEPS[step].at}`}</span>
      </div>
      <ol className="lp-tl">
        {STEPS.map((s, i) => (
          <li key={s.title} className={i < step ? 'is-done' : i === step ? 'is-now' : undefined}>
            <span className="lp-nd" aria-hidden="true">{i < step ? <Icon name="check" /> : i + 1}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.tags && <div className="lp-tags">{s.tags.map((t) => <span key={t}>{t}</span>)}</div>}
            </div>
            <span className="lp-ct">{s.at}</span>
          </li>
        ))}
      </ol>
      <div className={`lp-out${done ? ' is-on' : ''}`} aria-hidden={!done}>
        <span className="lp-doc"><Icon name="file" /></span>
        <div>
          <b>Urban tree canopy and heat-related deaths</b>
          <small>Report · 21 numbered sources</small>
        </div>
        <span className="lp-out-go">Open report</span>
      </div>
    </div>
  );
}
