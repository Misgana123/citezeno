'use client';

import { useState } from 'react';
import { citedSet, shorten, type Rendered } from '@/lib/engine';
import { plain } from '@/lib/styles';
import { copyText } from '../Specimens';
import { crossrefDOI, openlibraryISBN } from '@/lib/sources';
import type { Result, Source } from '@/lib/types';
import { Icon } from '../Icon';

export const PROVIDER_COLOR: Record<string, string> = {
  OpenAlex: '#2f6f9f',
  Crossref: '#c58a12',
  'Open Library': '#7a5aa8',
  Wikipedia: '#6b7686',
  Manual: '#2e7d5b',
};
export const TYPE_LABEL: Record<string, string> = {
  article: 'Article', book: 'Book', chapter: 'Chapter', web: 'Encyclopedia', preprint: 'Preprint',
  proceedings: 'Proceedings', dataset: 'Dataset', thesis: 'Thesis', report: 'Report',
};

export function strengthOf(score: number | null) {
  if (score == null) return { key: 'manual', label: 'Added by you' };
  if (score >= 0.55) return { key: 'strong', label: 'Strong match' };
  if (score >= 0.3) return { key: 'good', label: 'Good match' };
  return { key: 'weak', label: 'Weak match, check it' };
}

export function scoreFor(r: Result, id: string) {
  const claim = r.claims.find((c) => c.ids.includes(id));
  const cand = claim?.cands.find((x) => x.id === id);
  return { claim, score: cand ? cand.score : null };
}

export function authorLine(s: Source) {
  const a = s.authors || [];
  if (!a.length) return s.site || 'No author listed';
  return a.slice(0, 3).map((x) => `${x.given ? x.given + ' ' : ''}${x.family}`).join(', ') + (a.length > 3 ? ` and ${a.length - 3} more` : '');
}

export function SourceCards({
  result,
  rendered,
  onReplace,
  onRemove,
  onAdd,
  onPin,
}: {
  result: Result;
  rendered: Rendered;
  onPin: (id: string, pin: string) => void;
  onReplace: (oldId: string, newId: string) => void;
  onRemove: (id: string) => void;
  onAdd: (s: Source, claimIndex: number) => void;
}) {
  const [val, setVal] = useState('');
  const [ci, setCi] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const used = citedSet(result);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = val.trim();
    if (!v) return;
    setErr('');
    const isDOI = /10\.\d{4,9}\//.test(v);
    const isISBN = /^[\d\-\sXx]{10,17}$/.test(v);
    if (!isDOI && !isISBN) {
      setErr('Enter a DOI such as 10.1038/nature14539, or a 10- or 13-digit ISBN.');
      return;
    }
    setBusy(true);
    try {
      const s = isDOI ? await crossrefDOI(v.match(/10\.\d{4,9}\/\S+/)![0]) : await openlibraryISBN(v);
      onAdd(s, ci);
      setVal('');
    } catch (x) {
      setErr((x as Error).message === 'HTTP 404' ? 'That identifier is not in Crossref or Open Library.' : (x as Error).message);
    }
    setBusy(false);
  };

  return (
    <div>
      <form className="addsrc" onSubmit={add}>
        <div className="addsrc-copy">
          <b>Add a source you already trust</b>
          <small>Paste a DOI or ISBN. The record is fetched from Crossref or Open Library.</small>
        </div>
        <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="10.1038/nature14539 or 978-0374533557" aria-label="DOI or ISBN" />
        <select className="select" value={ci} onChange={(e) => setCi(+e.target.value)} aria-label="Attach to">
          <option value={-1}>Reference list only</option>
          {result.claims.map((c, i) => (
            <option key={i} value={i}>
              Claim {i + 1}: {shorten(c.text, 7)}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" type="submit" disabled={busy}>
          {busy ? 'Fetching…' : 'Add source'}
        </button>
        {err && <p className="addsrc-err" role="alert">{err}</p>}
      </form>

      {rendered.list.length === 0 ? (
        <p className="empty-note">No sources yet. Add one above or trace again with lower match strictness.</p>
      ) : (
        <div className="scards">
          {rendered.list.map((s) => {
            const n = rendered.number.get(s.id!)!;
            const { claim, score } = scoreFor(result, s.id!);
            const st = strengthOf(score);
            const altList = claim ? claim.cands.filter((x) => !used.has(x.id)).slice(0, 6) : [];
            const alts = claim ? claim.cands.filter((x) => !used.has(x.id)).length : 0;
            const entry = rendered.entries.get(s.id!) || '';
            const provs = s.providers || [s.provider];
            const venue = [s.container, s.type === 'book' ? s.publisher : '', s.year].filter(Boolean).join(', ');
            return (
              <article key={s.id} className="scard" data-ref={n - 1}>
                <div className="scard-top">
                  <span className="scard-n">{rendered.numbered ? `[${n}]` : n}</span>
                  <div className="tags">
                    {provs.map((p) => (
                      <span key={p} className="tag prov" style={{ ['--c' as string]: PROVIDER_COLOR[p] || '#2f6f9f' } as React.CSSProperties}>
                        {p}
                      </span>
                    ))}
                    <span className="tag">{TYPE_LABEL[s.type] || 'Work'}</span>
                    {s.oa && <span className="tag oa">Open access</span>}
                    {s.retracted && (
                      <span className="tag retracted" title="OpenAlex lists this work as retracted. Don’t cite it.">
                        Retracted
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="scard-title">
                  <a href={s.url || '#'} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                </h3>
                <p className="scard-auth">{authorLine(s)}</p>
                {venue && (
                  <p className="scard-venue">
                    {venue}
                    {s.citedBy && s.provider !== 'Open Library' ? <span>, cited by {s.citedBy.toLocaleString()}</span> : null}
                  </p>
                )}
                <blockquote className="scard-for">
                  <small>{claim ? 'Supports' : 'Reference list only'}</small>
                  {claim ? shorten(claim.text, 28) : 'Not attached to a sentence.'}
                </blockquote>
                <div className="pin">
                  <label>
                    <span>Page cited</span>
                    <input
                      className="input"
                      value={(result.pins || {})[s.id!] || ''}
                      onChange={(e) => onPin(s.id!, e.target.value.slice(0, 20))}
                      placeholder={s.pages ? `within ${s.pages}` : 'e.g. 437 or 12–15'}
                      aria-label={`Page you are citing in “${s.title}”`}
                    />
                  </label>
                  <small>{s.pages ? `Pages ${s.pages} in the source` : s.type === 'book' ? 'Book: add the page you used' : 'No page range on record'}</small>
                </div>
                <div className={`meter ${st.key}`}>
                  <span className="meter-label">{st.label}</span>
                  {score != null && (
                    <>
                      <span className="meter-track"><i style={{ width: `${Math.max(6, Math.round(score * 100))}%` }} /></span>
                      <span className="meter-pct">{Math.round(score * 100)}%</span>
                    </>
                  )}
                </div>
                <div className="scard-actions">
                  <button
                    onClick={() => setOpen(open === s.id ? null : s.id!)}
                    disabled={!alts}
                    aria-expanded={open === s.id}
                    title="See the other matches for this claim"
                  >
                    <Icon name="layers" /> Other matches{alts ? ` (${alts})` : ''}
                  </button>
                  <button onClick={() => copyText(plain(entry).replace(/^\[?\d+\]?\.?\s/, ''), entry)} title="Copy this reference">
                    <Icon name="copy" /> Copy
                  </button>
                  <a href={s.url || '#'} target="_blank" rel="noopener noreferrer" title="Open the source">
                    <Icon name="external" />
                    <span className="sr-only">Open</span>
                  </a>
                  <button className="rm" onClick={() => onRemove(s.id!)} title="Remove from the list">
                    <Icon name="trash" />
                    <span className="sr-only">Remove</span>
                  </button>
                </div>
                {open === s.id && (
                  <ul className="alts">
                    {altList.map((c) => {
                      const a = result.db.get(c.id)!;
                      return (
                        <li key={c.id}>
                          <div>
                            <a href={a.url || '#'} target="_blank" rel="noopener noreferrer">{a.title}</a>
                            <small>
                              {(a.authors[0]?.family || a.site || 'Unknown')}
                              {a.authors.length > 1 ? ' et al.' : ''}, {a.year || 'n.d.'}, {a.provider}
                            </small>
                          </div>
                          <span className={`alts-score ${strengthOf(c.score).key}`}>{Math.round(c.score * 100)}%</span>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              onReplace(s.id!, c.id);
                              setOpen(null);
                            }}
                          >
                            Use this
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
