'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { subjectColor, subjectLabel } from '@/lib/papers/subjects';
import type { Paper } from '@/lib/papers/types';
import { referenceText } from '../chat/file/citation';
import { Icon } from '../Icon';
import { SaveButton } from '../shelf/SaveButton';
import { toast } from '../toast';
import { authorsShort, compactCount, typeLabel } from './format';

/* One paper in the Explore gallery: its subject (as a coloured line and label),
   year, title, authors, the start of its abstract, citations and access. The
   whole card opens the preview; Cite copies its reference and Save keeps it on
   the shelf (both show on hover, and always on touch screens). */
export function GalleryCard({ paper, onOpen, active = false }: { paper: Paper; onOpen: (p: Paper) => void; active?: boolean }) {
  const label = subjectLabel(paper.subject) ?? typeLabel(paper.type) ?? 'Paper';
  const open = (e: MouseEvent) => {
    // buttons and links inside the card do their own thing
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
    onOpen(paper);
  };
  return (
    <article
      className={`ex-card${active ? ' is-active' : ''}${paper.isRetracted ? ' is-retracted' : ''}`}
      style={{ '--c': subjectColor(paper.subject) } as CSSProperties}
      onClick={open}
    >
      <div className="ex-card-meta">
        <span className="ex-card-subject">{label}</span>
        {paper.year != null && (
          <>
            <span aria-hidden="true">·</span>
            <span>{paper.year}</span>
          </>
        )}
      </div>
      <h3 className="ex-card-title">
        <button type="button" onClick={() => onOpen(paper)} aria-haspopup="dialog">
          {paper.title}
        </button>
      </h3>
      <p className="ex-card-by">{authorsShort(paper.authors)}</p>
      {paper.abstract && <p className="ex-card-ab">{paper.abstract}</p>}
      <div className="ex-card-foot">
        <span className="ex-cites" title={`${paper.citedByCount.toLocaleString('en-US')} citations`}>
          <b>{compactCount(paper.citedByCount)}</b>
          <span>citations</span>
        </span>
        {paper.isRetracted ? <span className="tag retracted ex-tag">Retracted</span> : paper.isOpenAccess && <span className="tag oa ex-tag">Open access</span>}
        <span className="ex-grow" />
        <span className="ex-card-acts">
          <CiteButton paper={paper} />
          <SaveButton paper={paper} compact />
        </span>
      </div>
    </article>
  );
}

/* Copy the paper's reference (APA) with the Citation Studio's style engine. */
function CiteButton({ paper }: { paper: Paper }) {
  const cite = async () => {
    try {
      await navigator.clipboard.writeText(await referenceText(paper));
      toast('Reference copied (APA)');
    } catch {
      toast('Could not copy the reference', true);
    }
  };
  return (
    <button type="button" className="icon-btn ex-icon-btn" onClick={cite} title="Copy the reference (APA)" aria-label="Copy the reference">
      <Icon name="quote" />
    </button>
  );
}
