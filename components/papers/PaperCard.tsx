import type { Paper } from '@/lib/papers/types';
import { authorsShort, citationLabel, typeLabel } from './format';
import { PaperBadges, PaperLinks } from './PaperBadges';

/* One search result. With `onOpen`, the title opens the preview panel;
   without it, it links to the paper's page. */
export function PaperCard({ paper, onOpen, active = false }: { paper: Paper; onOpen?: (p: Paper) => void; active?: boolean }) {
  const meta = [paper.year, paper.source, typeLabel(paper.type)].filter(Boolean);
  const href = paper.landingUrl ?? `https://openalex.org/${paper.openalexId}`;
  return (
    <li className={`fp-card${paper.isRetracted ? ' is-retracted' : ''}${active ? ' is-active' : ''}`}>
      <div className="fp-card-top">
        <PaperBadges paper={paper} />
        <span className="fp-cites" title="Times cited">
          {citationLabel(paper.citedByCount)}
        </span>
      </div>
      <h3 className="fp-title">
        {onOpen ? (
          <button type="button" onClick={() => onOpen(paper)} aria-haspopup="dialog">
            {paper.title}
          </button>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {paper.title}
          </a>
        )}
      </h3>
      <p className="fp-authors">{authorsShort(paper.authors)}</p>
      {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
      <p className={`fp-abstract${paper.abstract ? '' : ' is-empty'}`}>{paper.abstract ?? 'No abstract available.'}</p>
      <PaperLinks paper={paper} />
    </li>
  );
}
