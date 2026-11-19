import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { doiHref } from './format';

/* The Open access / Retracted labels, shared by cards and the preview. */
export function PaperBadges({ paper }: { paper: Paper }) {
  if (!paper.isRetracted && !paper.isOpenAccess) return null;
  return (
    <span className="tags">
      {paper.isRetracted && (
        <span className="tag retracted fp-tag">
          <Icon name="alert" /> Retracted
        </span>
      )}
      {paper.isOpenAccess &&
        (paper.pdfUrl ? (
          <a className="tag oa fp-tag" href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" title="Open the free PDF">
            <Icon name="pdf" /> Open access · PDF
          </a>
        ) : (
          <span className="tag oa fp-tag">Open access</span>
        ))}
    </span>
  );
}

/* DOI link when there is one, the provider's record otherwise (or both, `both`). */
export function PaperLinks({ paper, both = false }: { paper: Paper; both?: boolean }) {
  return (
    <span className="fp-links">
      {paper.doi && (
        <a href={doiHref(paper.doi)} target="_blank" rel="noopener noreferrer">
          <Icon name="external" /> DOI {paper.doi}
        </a>
      )}
      {(both || !paper.doi) && paper.record && (
        <a href={paper.record.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" /> {paper.record.label}
        </a>
      )}
    </span>
  );
}
