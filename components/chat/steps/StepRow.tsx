'use client';

import { useState } from 'react';
import type { StepKind } from '@/lib/agent/tools/types';
import type { PaperAuthor } from '@/lib/papers/types';
import { Icon, type IconName } from '../../Icon';
import { authorsShort, paperLink } from '../../papers/format';
import { aboutOf, groupLine, type LiveStep } from './timeline';

/* One row of the timeline: what a step did, what about, what it came to, and
   (opened) exactly what it found. Joined steps open to their own rows. */

const KIND_ICON: Record<StepKind, IconName> = {
  papers: 'search',
  web: 'globe',
  read: 'book',
  trace: 'map',
  shelf: 'layers',
  change: 'pencil',
  make: 'doc',
  code: 'code',
  cite: 'quote',
  plan: 'compass',
};

const FOUND_SHOWN = 5;

/* "who.int" from a page's address */
export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const isWeb = (url: string | null | undefined): url is string => !!url && /^https?:\/\//i.test(url);

/* "Gerlich et al. · 2025" (nothing for a paper with no authors listed) */
const byline = (p: { authors: PaperAuthor[]; year: number | null }) => [p.authors.length ? authorsShort(p.authors, 1) : null, p.year].filter(Boolean).join(' · ');

type Found = { key: string; title: string; href: string | null; meta: string; web: boolean; retracted?: boolean };

/* What one step found, as short rows: papers, saved papers, web pages, sources. */
function found(s: LiveStep): Found[] {
  const d = s.display;
  if (!d) return [];
  return [
    ...(d.papers ?? []).map((p) => ({ key: p.id, title: p.title, href: paperLink(p), meta: byline(p), web: false, retracted: p.isRetracted })),
    ...(d.items ?? []).map((i) => ({ key: i.id, title: i.paper.title, href: paperLink(i.paper), meta: byline(i.paper), web: false, retracted: i.paper.isRetracted })),
    ...(d.links ?? []).filter((l) => isWeb(l.url)).map((l) => ({ key: l.url, title: l.title || host(l.url), href: l.url, meta: host(l.url), web: true })),
    ...(d.sources ?? []).map((src, k) => ({ key: `s${k}`, title: src.title, href: isWeb(src.link) ? src.link : null, meta: [src.authors, src.year].filter(Boolean).join(' · '), web: false, retracted: src.retracted })),
  ].map((f) => ({ ...f, href: isWeb(f.href) ? f.href : null }));
}

function FoundList({ rows }: { rows: Found[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FOUND_SHOWN);
  return (
    <div className="ch-tl-found">
      <ul>
        {shown.map((f) => (
          <li key={f.key}>
            {f.web ? (
              <span className="ch-tl-site" aria-hidden="true">
                <Icon name="globe" />
              </span>
            ) : (
              <Icon name="doc" className="ch-tl-doc" aria-hidden="true" />
            )}
            {f.href ? (
              <a className="ch-tl-title" href={f.href} target="_blank" rel="noopener noreferrer" title={f.title}>
                {f.title}
              </a>
            ) : (
              <span className="ch-tl-title" title={f.title}>
                {f.title}
              </span>
            )}
            {f.retracted && <span className="ch-flag">Retracted</span>}
            {f.meta && <span className="ch-tl-host">{f.meta}</span>}
          </li>
        ))}
      </ul>
      {rows.length > FOUND_SHOWN && (
        <button type="button" className="ch-tl-more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

/* How many results a step found, for rows saved before steps had a summary. */
function count(s: LiveStep): string | null {
  const d = s.display;
  if (!d) return null;
  const n = (d.papers?.length ?? 0) + (d.items?.length ?? 0) + (d.sources?.length ?? 0) + (d.links?.length ?? 0);
  return n ? `${n} result${n === 1 ? '' : 's'}` : null;
}

function KindIcon({ kind }: { kind?: StepKind }) {
  return <Icon name={kind ? KIND_ICON[kind] : 'check'} className="ch-tl-ic" aria-hidden="true" />;
}

/* The line of a row: icon, what it did (bold), what about, what it came to. */
function Line({ kind, did, about, meta, live = false, chevron = false }: { kind?: StepKind; did: string; about?: string; meta?: string | null; live?: boolean; chevron?: boolean }) {
  return (
    <>
      {live ? <span className="ch-spin" aria-label="Working" /> : <KindIcon kind={kind} />}
      <span className={`ch-tl-did${live ? ' is-live' : ''}`}>{did}</span>
      {about && (
        <span className="ch-tl-about" title={about}>
          {about}
        </span>
      )}
      {meta && <span className="ch-tl-meta">{meta}</span>}
      {chevron && <Icon name="chevron" className="ch-tl-chev" aria-hidden="true" />}
    </>
  );
}

export function StepRow({ step: s }: { step: LiveStep }) {
  if (s.status === 'running')
    return (
      <li className="ch-tl-step is-running">
        <div className="ch-tl-row">
          <Line kind={s.kind} did={s.label} live />
        </div>
      </li>
    );
  if (s.status !== 'done')
    return (
      <li className={`ch-tl-step is-${s.status}`}>
        <div className="ch-tl-row">
          <Icon name={s.status === 'declined' ? 'x' : 'alert'} className="ch-tl-ic is-bad" aria-hidden="true" />
          <span className="ch-tl-did">{s.status === 'declined' ? `Not done: ${s.label}` : s.label}</span>
        </div>
        {s.status === 'error' && s.error && <p className="ch-tl-error">{s.error}</p>}
      </li>
    );
  const rows = found(s);
  const did = s.line?.did ?? s.label;
  const meta = s.display?.summary ?? count(s);
  if (!rows.length)
    return (
      <li className="ch-tl-step is-done">
        <div className="ch-tl-row">
          <Line kind={s.kind} did={did} about={aboutOf(s)} meta={meta} />
        </div>
      </li>
    );
  return (
    <li className="ch-tl-step is-done">
      <details>
        <summary className="ch-tl-row">
          <Line kind={s.kind} did={did} about={aboutOf(s)} meta={meta} chevron />
        </summary>
        <FoundList rows={rows} />
      </details>
    </li>
  );
}

/* Steps of one kind that ran one after another: one row that opens to each. */
export function GroupRow({ kind, steps }: { kind: StepKind; steps: LiveStep[] }) {
  const running = steps.some((s) => s.status === 'running');
  const line = groupLine(kind, steps);
  return (
    <li className={`ch-tl-step ${running ? 'is-running' : 'is-done'}`}>
      <details open={running || undefined}>
        <summary className="ch-tl-row">
          <Line kind={kind} did={line.did} about={line.about} live={running} chevron />
        </summary>
        <ol className="ch-tl-sub">
          {steps.map((s) => (
            <StepRow key={s.callId} step={s} />
          ))}
        </ol>
      </details>
    </li>
  );
}
