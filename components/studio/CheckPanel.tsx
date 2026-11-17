'use client';

import { useEffect, useMemo, useState } from 'react';
import { shorten } from '@/lib/engine';
import { STATUS_LABEL, type Detected, type InText, type RefEntry, type Status, type Verdict } from '@/lib/refcheck';
import { Icon, type IconName } from '../Icon';
import { authorLine } from './SourceCards';

export type CheckState = {
  detected: Detected;
  verdicts: Map<number, Verdict>;
  running: boolean;
  /* the draft as it was when checked; positions refer to it */
  draft: string;
};

const ORDER: Status[] = ['notfound', 'retracted', 'partial', 'corrected', 'error', 'verified'];
const ICON: Record<Status, IconName> = { verified: 'check', partial: 'alert', notfound: 'x', retracted: 'alert', corrected: 'wand', error: 'clock' };

/* Results of "Check existing citations": every reference found in the draft,
   labelled, with what differs and what to do next. */
export function CheckPanel({
  state,
  stale,
  citing,
  onShow,
  onFind,
  onRecheck,
  onRetry,
  onClose,
}: {
  state: CheckState;
  /* the draft changed since the check */
  stale: boolean;
  citing: boolean;
  onShow: (start: number, end: number) => void;
  onFind: (e: RefEntry) => void;
  onRecheck: () => void;
  /* check again only the ones that couldn't be checked */
  onRetry: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const { detected, verdicts, running } = state;
  const total = detected.entries.length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const counts = useMemo(() => {
    const c: Partial<Record<Status, number>> = {};
    verdicts.forEach((v) => (c[v.status] = (c[v.status] || 0) + 1));
    return c;
  }, [verdicts]);

  const citedBy = useMemo(() => {
    const m = new Map<number, InText[]>();
    detected.intext.forEach((c) => c.entries.forEach((id) => m.set(id, [...(m.get(id) || []), c])));
    return m;
  }, [detected]);
  const uncited = useMemo(() => new Set(detected.uncited.map((e) => e.id)), [detected]);

  const rank = (e: RefEntry) => {
    const v = verdicts.get(e.id);
    return v ? ORDER.indexOf(v.status) : ORDER.length;
  };
  const shown = detected.entries.filter((e) => filter === 'all' || verdicts.get(e.id)?.status === filter).sort((a, b) => rank(a) - rank(b) || a.id - b.id);

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer chk" role="dialog" aria-labelledby="chk-title">
        <header className="drawer-head">
          <div>
            <h2 id="chk-title">Existing citations</h2>
            <p className="small" aria-live="polite">
              {total === 0
                ? 'No references found in your draft.'
                : running
                  ? `Checking ${verdicts.size} of ${total} reference${total === 1 ? '' : 's'}…`
                  : `${total} reference${total === 1 ? '' : 's'} checked in OpenAlex, Crossref and Open Library.`}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        <div className="chk-body">
          {running && (
            <div className="chk-bar" aria-hidden="true">
              <i style={{ width: `${total ? (verdicts.size / total) * 100 : 0}%` }} />
            </div>
          )}

          <p className="chk-note">
            <Icon name="shield" />
            <span>
              <b>“Not found” means we couldn’t find it in these databases</b>, not that it is proven fake. Books, reports, web
              pages and very recent papers are often missing. Open each one and check it yourself. Checking is free.
            </span>
          </p>

          {stale && (
            <p className="chk-stale">
              <Icon name="alert" /> Your draft has changed since this check.
              <button type="button" className="shd-mini" onClick={onRecheck}>
                Check again
              </button>
            </p>
          )}

          {!running && !stale && (counts.error || 0) > 0 && (
            <p className="chk-retry">
              <Icon name="clock" />
              <span>
                {counts.error} reference{counts.error === 1 ? '' : 's'} couldn’t be checked because a database was busy or slow.
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
                Retry {counts.error === 1 ? 'it' : 'them'}
              </button>
            </p>
          )}

          {total > 0 && (
            <div className="chk-filters" role="group" aria-label="Show">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All <b>{total}</b>
              </button>
              {ORDER.filter((s) => counts[s]).map((s) => (
                <button key={s} type="button" className={`st-${s}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
                  {STATUS_LABEL[s]} <b>{counts[s]}</b>
                </button>
              ))}
            </div>
          )}

          {total === 0 && (
            <div className="drawer-empty">
              <Icon name="list" />
              <p>
                We look for DOIs anywhere in the text, a list under a heading such as References, Bibliography, Works Cited or
                Sources, and in-text citations like (Smith, 2020) or [3].
              </p>
            </div>
          )}

          <ul className="chk-list">
            {shown.map((e) => {
              const v = verdicts.get(e.id);
              const cites = citedBy.get(e.id) || [];
              return (
                <li key={e.id} className={v ? `st-${v.status}` : 'pending'}>
                  <div className="chk-top">
                    <span className={`chk-badge${v ? ` st-${v.status}` : ''}`}>
                      {v ? (
                        <>
                          <Icon name={ICON[v.status]} /> {STATUS_LABEL[v.status]}
                        </>
                      ) : (
                        <>
                          <span className="spin" aria-hidden="true" /> Checking
                        </>
                      )}
                    </span>
                    {e.inList ? <span className="chk-tag">{e.number != null ? `#${e.number}` : 'Reference list'}</span> : <span className="chk-tag">DOI in the text</span>}
                    {e.inList && uncited.has(e.id) && <span className="chk-tag warn">Never cited in the text</span>}
                  </div>
                  <p className="chk-raw serif">{shorten(e.raw, 40)}</p>
                  {v?.match && (
                    <div className="chk-match">
                      <small>{v.status === 'verified' || v.status === 'corrected' || v.status === 'retracted' ? 'Matches' : 'Closest record'}</small>
                      <a href={v.match.url || (v.match.doi ? `https://doi.org/${v.match.doi}` : '#')} target="_blank" rel="noopener noreferrer">
                        {v.match.title}
                      </a>
                      <span>
                        {authorLine(v.match)}
                        {v.match.year ? ` · ${v.match.year}` : ''}
                        {v.match.container ? ` · ${v.match.container}` : ''} · {v.match.provider}
                      </span>
                    </div>
                  )}
                  {v && v.diffs.length > 0 && (
                    <ul className="chk-diffs">
                      {v.diffs.map((d, i) => (
                        <li key={i}>{d.charAt(0).toUpperCase() + d.slice(1)}.</li>
                      ))}
                    </ul>
                  )}
                  {v && v.notices.length > 0 && (
                    <ul className="chk-notices">
                      {v.notices.map((n, i) => (
                        <li key={i}>
                          <Icon name="alert" /> {n.label}
                          {n.doi && (
                            <>
                              {' '}
                              <a href={`https://doi.org/${n.doi}`} target="_blank" rel="noopener noreferrer">
                                Read it
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {v?.note && <p className="chk-why">{v.note}</p>}
                  <div className="chk-actions">
                    <button type="button" className="shd-mini" onClick={() => onShow(e.start, e.end)} disabled={stale}>
                      Show in draft
                    </button>
                    {cites[0] && (
                      <button type="button" className="shd-mini" onClick={() => onShow(cites[0].start, cites[0].end)} disabled={stale}>
                        Show where it’s cited
                      </button>
                    )}
                    {v?.status === 'notfound' &&
                      (cites.length ? (
                        <button type="button" className="btn btn-thread btn-sm" onClick={() => onFind(e)} disabled={citing || stale}>
                          <Icon name="search" /> {citing ? 'Searching…' : 'Find a real source for this sentence'} <span className="chk-cost">1 credit</span>
                        </button>
                      ) : (
                        <span className="chk-hint">Not cited in the text, so there’s no sentence to find a source for.</span>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {detected.orphans.length > 0 && (
            <section className="chk-orphans">
              <h3>
                <Icon name="alert" /> In-text citations with no reference ({detected.orphans.length})
              </h3>
              <p>These point to nothing in your reference list.</p>
              <ul>
                {detected.orphans.map((c, i) => (
                  <li key={i}>
                    <span className="serif">{c.raw}</span>
                    <button type="button" className="shd-mini" onClick={() => onShow(c.start, c.end)} disabled={stale}>
                      Show in draft
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
