'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STYLES, disambiguate } from '@/lib/styles';
import type { Source } from '@/lib/types';
import { Icon } from './Icon';

/* Three real, verifiable works — the demo never shows an invented reference. */
const WORKS: Source[] = [
  {
    id: 'h1', provider: 'OpenAlex', type: 'article', title: 'Deep learning',
    authors: [{ given: 'Yann', family: 'LeCun' }, { given: 'Yoshua', family: 'Bengio' }, { given: 'Geoffrey', family: 'Hinton' }],
    year: 2015, date: '2015-05-28', container: 'Nature', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539',
  },
  {
    id: 'h2', provider: 'Crossref', type: 'article', title: 'Dermatologist-level classification of skin cancer with deep neural networks',
    authors: [
      { given: 'Andre', family: 'Esteva' }, { given: 'Brett', family: 'Kuprel' }, { given: 'Roberto A.', family: 'Novoa' },
      { given: 'Justin', family: 'Ko' }, { given: 'Susan M.', family: 'Swetter' }, { given: 'Helen M.', family: 'Blau' },
      { given: 'Sebastian', family: 'Thrun' },
    ],
    year: 2017, date: '2017-02-02', container: 'Nature', volume: '542', issue: '7639', pages: '115–118', doi: '10.1038/nature21056',
  },
  {
    id: 'h3', provider: 'OpenAlex', type: 'article', title: 'Dissecting racial bias in an algorithm used to manage the health of populations',
    authors: [
      { given: 'Ziad', family: 'Obermeyer' }, { given: 'Brian', family: 'Powers' }, { given: 'Christine', family: 'Vogeli' },
      { given: 'Sendhil', family: 'Mullainathan' },
    ],
    year: 2019, date: '2019-10-25', container: 'Science', volume: '366', issue: '6464', pages: '447–453', doi: '10.1126/science.aax2342',
  },
];

const CLAIMS = [
  'Deep neural networks learn layered representations of data, a shift that transformed fields from speech recognition to image analysis.',
  'In dermatology, a convolutional network classified skin cancer from photographs about as well as board-certified dermatologists.',
  'A widely used commercial algorithm underestimated the health needs of Black patients because it predicted need from past spending.',
];

const CYCLE = ['apa', 'mla', 'chicago', 'ieee', 'harvard', 'vancouver'];

function formatted(styleId: string, s: Source, n: number) {
  const st = STYLES[styleId];
  const ctx = disambiguate(st, [s]);
  const prefix = st.family === 'numeric' ? (st.marker === 'bracket' ? `[${n}] ` : `${n}. `) : '';
  return prefix + st.entry(s, ctx);
}

export function HeroThread() {
  const stage = useRef<HTMLDivElement>(null);
  const sups = useRef<(HTMLElement | null)[]>([]);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const sheet = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);
  const [paths, setPaths] = useState<{ d: string; len: number; end: [number, number]; start: [number, number] }[]>([]);
  const [style, setStyle] = useState('apa');
  const [fade, setFade] = useState(false);
  const [auto, setAuto] = useState(true);

  /* the one orchestrated moment: claims light up and threads run to their sources */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setLit(3);
      return;
    }
    const ts = [700, 1700, 2700].map((ms, i) => setTimeout(() => setLit(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, []);

  const measure = useCallback(() => {
    const st = stage.current;
    if (!st) return;
    const box = st.getBoundingClientRect();
    const next = sups.current.map((sup, i) => {
      const card = cards.current[i];
      if (!sup || !card) return null;
      const a = sup.getBoundingClientRect();
      const b = card.getBoundingClientRect();
      const sh = sheet.current?.getBoundingClientRect();
      const x1 = (sh && sh.width < box.width * 0.8 ? sh.right : a.right) - box.left + 4;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left - 2;
      const y2 = b.top + 22 - box.top;
      const dx = Math.max(40, (x2 - x1) * 0.55);
      const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      const len = Math.hypot(x2 - x1, y2 - y1) * 1.35 + 40;
      return { d, len, end: [x2, y2] as [number, number], start: [x1, y1] as [number, number] };
    });
    setPaths(next.filter(Boolean) as typeof paths);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const pick = useCallback((id: string) => {
    setFade(true);
    setTimeout(() => {
      setStyle(id);
      setFade(false);
    }, 220);
  }, []);

  useEffect(() => {
    if (!auto || lit < 3) return;
    const t = setInterval(() => {
      setStyle((cur) => {
        const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
        setFade(true);
        setTimeout(() => setFade(false), 240);
        return next;
      });
    }, 4200);
    return () => clearInterval(t);
  }, [auto, lit]);

  return (
    <div className="pt">
      <div className="pt-stage" ref={stage}>
        <svg className="pt-svg" aria-hidden="true">
          {paths.map((p, i) =>
            i < lit ? (
              <g key={i}>
                <path className="draw" d={p.d} style={{ ['--len' as string]: p.len } as React.CSSProperties} />
                <circle cx={p.end[0]} cy={p.end[1]} r="3.5" />
                <circle className="start" cx={p.start[0]} cy={p.start[1]} r="3" />
              </g>
            ) : null,
          )}
        </svg>

        <div className="pt-sheet" ref={sheet} aria-label="Example draft with three cited claims">
          <div className="pt-sheet-head">
            <span>Draft, page 3</span>
            <span>3 claims found</span>
          </div>
          {CLAIMS.map((c, i) => (
            <p key={i}>
              <span className={`pt-claim${i < lit ? ' on' : ''}`}>
                {c}
                <sup className="pt-sup" ref={(el) => { sups.current[i] = el; }}>
                  {i + 1}
                </sup>
              </span>
            </p>
          ))}
        </div>

        <div className="pt-cards">
          {WORKS.map((w, i) => (
            <article key={w.id} className={`pt-card${i < lit ? ' on' : ''}`} ref={(el) => { cards.current[i] = el; }} style={{ transitionDelay: `${0.45}s` }}>
              <span className="pt-card-n">{i + 1}</span>
              <div className="pt-card-top">
                <span>{w.container}, {w.year}</span>
                <span className="ok"><Icon name="check" /> DOI resolves</span>
              </div>
              <p className={`pt-ref${fade ? ' fade' : ''}`} dangerouslySetInnerHTML={{ __html: formatted(style, { ...w, url: `https://doi.org/${w.doi}` }, i + 1) }} />
            </article>
          ))}
        </div>
      </div>

      <div className="pt-styles" role="group" aria-label="Show the references in another style">
        <span style={{ marginRight: 4 }}>Format as</span>
        {CYCLE.map((id) => (
          <button
            key={id}
            aria-pressed={style === id}
            onClick={() => {
              setAuto(false);
              pick(id);
            }}
          >
            {STYLES[id].name}
          </button>
        ))}
      </div>
    </div>
  );
}
