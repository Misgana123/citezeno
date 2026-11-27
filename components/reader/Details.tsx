'use client';

import { citationLabel, doiHref, typeLabel } from '../papers/format';
import { Icon } from '../Icon';
import { SaveButton } from '../shelf/SaveButton';
import type { ReaderData } from './api';
import { asPaper } from './upload';

/* The paper's details: title, authors, year, DOI, citation count, a retraction
   warning when it applies, and Save to shelf when it isn't saved. */
export function Details({ data, children }: { data: ReaderData; children?: React.ReactNode }) {
  const p = data.paper;
  const meta = [p.year, p.source, typeLabel(p.type)].filter(Boolean);
  return (
    <article className="fp-detail rd-details">
      {p.isRetracted && <RetractedNotice />}
      <h2 className="fp-detail-title rd-details-title">{p.title}</h2>
      <p className="fp-detail-authors">{p.authors.length ? p.authors.map((a) => a.name).join(', ') : 'No authors listed'}</p>
      {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
      <div className="fp-detail-facts">
        <span className="tag">{citationLabel(p.citedByCount)}</span>
        {p.isOpenAccess && <span className="tag oa">Open access</span>}
        {p.doi && (
          <a className="tag rd-doi" href={doiHref(p.doi)} target="_blank" rel="noopener noreferrer">
            DOI {p.doi}
          </a>
        )}
      </div>
      <div className="fp-detail-links">
        {!data.shelf && <SaveButton paper={asPaper(p)} menuAlign="left" />}
        {originalHref(data) && (
          <a className="btn btn-ghost btn-sm" href={originalHref(data)!} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Open original
          </a>
        )}
      </div>
      {children}
      <section className="fp-detail-sec">
        <h3>Abstract</h3>
        {p.abstract ? <p className="fp-detail-abstract">{p.abstract}</p> : <p className="fp-abstract is-empty">No abstract available.</p>}
      </section>
    </article>
  );
}

export function RetractedNotice() {
  return (
    <p className="fp-retracted" role="alert">
      <Icon name="alert" />
      <span>
        <b>This paper has been retracted.</b> Its findings should not be relied on or cited as valid.
      </span>
    </p>
  );
}

/* The publisher's page (or the DOI, or the paper's record). */
export const originalHref = (data: ReaderData) => data.paper.landingUrl ?? (data.paper.doi ? doiHref(data.paper.doi) : (data.paper.record?.url ?? null));
