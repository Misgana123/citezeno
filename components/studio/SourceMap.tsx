'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { shorten, type Rendered } from '@/lib/engine';
import type { Result } from '@/lib/types';
import { PROVIDER_COLOR, strengthOf } from './SourceCards';

type Link = { ci: number; id: string; score: number };
type Focus = { kind: 'claim'; ci: number } | { kind: 'source'; id: string } | null;

/* Claims on the left, sources on the right, one thread per citation.
   Thread weight follows the match score. */
export function SourceMap({ result, rendered }: { result: Result; rendered: Rendered }) {
  const box = useRef<HTMLDivElement>(null);
  const claimEls = useRef<(HTMLElement | null)[]>([]);
  const srcEls = useRef<Map<string, HTMLElement | null>>(new Map());
  const [geo, setGeo] = useState<{ d: string; link: Link }[]>([]);
  const [focus, setFocus] = useState<Focus>(null);

  const links: Link[] = [];
  result.claims.forEach((c, ci) =>
    c.ids.forEach((id) => {
      const cand = c.cands.find((x) => x.id === id);
      links.push({ ci, id, score: cand ? cand.score : 0.5 });
    }),
  );
  const linkKey = links.map((l) => `${l.ci}:${l.id}`).join('|');

  const measure = useCallback(() => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const out: { d: string; link: Link }[] = [];
    links.forEach((l) => {
      const a = claimEls.current[l.ci]?.getBoundingClientRect();
      const s = srcEls.current.get(l.id)?.getBoundingClientRect();
      if (!a || !s) return;
      const x1 = a.right - b.left;
      const y1 = a.top + a.height / 2 - b.top;
      const x2 = s.left - b.left;
      const y2 = s.top + s.height / 2 - b.top;
      const dx = (x2 - x1) * 0.5;
      out.push({ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, link: l });
    });
    setGeo(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure]);

  const active = (l: Link) =>
    !focus || (focus.kind === 'claim' && focus.ci === l.ci) || (focus.kind === 'source' && focus.id === l.id);
  const claimOn = (ci: number) => !focus || links.some((l) => l.ci === ci && active(l));
  const srcOn = (id: string) => !focus || links.some((l) => l.id === id && active(l));

  if (!rendered.list.length) return <p className="empty-note">There is nothing to map yet. Trace sources or add one by DOI.</p>;

  return (
    <div className="pmap" ref={box} onMouseLeave={() => setFocus(null)}>
      <svg className="pmap-svg" aria-hidden="true">
        {geo.map((g, i) => (
          <path
            key={i}
            d={g.d}
            className={`${strengthOf(g.link.score).key}${active(g.link) ? ' on' : ''}`}
            style={{ strokeWidth: 1 + g.link.score * 4 }}
          />
        ))}
      </svg>
      <div className="pmap-col">
        <h3 className="pmap-h">Claims in your draft</h3>
        {result.claims.map((c, ci) => (
          <button
            key={ci}
            ref={(el) => { claimEls.current[ci] = el; }}
            className={`pmap-claim${claimOn(ci) ? '' : ' dim'}${c.ids.length ? '' : ' none'}`}
            onMouseEnter={() => setFocus({ kind: 'claim', ci })}
            onFocus={() => setFocus({ kind: 'claim', ci })}
            onBlur={() => setFocus(null)}
          >
            <span className="pmap-n">{ci + 1}</span>
            <span className="serif">{shorten(c.text, 22)}</span>
            {!c.ids.length && <small>No source met the strictness threshold</small>}
          </button>
        ))}
      </div>
      <div className="pmap-col">
        <h3 className="pmap-h">Sources</h3>
        {rendered.list.map((s) => (
          <a
            key={s.id}
            href={s.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            ref={(el) => { srcEls.current.set(s.id!, el); }}
            className={`pmap-src${srcOn(s.id!) ? '' : ' dim'}`}
            onMouseEnter={() => setFocus({ kind: 'source', id: s.id! })}
            onFocus={() => setFocus({ kind: 'source', id: s.id! })}
            onBlur={() => setFocus(null)}
            style={{ ['--c' as string]: PROVIDER_COLOR[s.provider] || '#2f6f9f' } as React.CSSProperties}
          >
            <span className="pmap-n">{rendered.number.get(s.id!)}</span>
            <span>
              <b>{shorten(s.title, 12)}</b>
              <small>
                {(s.authors[0]?.family || s.site || 'Unknown')}
                {s.authors.length > 1 ? ' et al.' : ''}, {s.year || 'n.d.'}
              </small>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
