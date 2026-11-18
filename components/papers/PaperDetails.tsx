import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { citationLabel, languageName, typeLabel } from './format';
import { SaveButton } from '../shelf/SaveButton';
import { PaperLinks } from './PaperBadges';

/* Everything the preview shows about one paper. */
export function PaperDetails({ paper, loading }: { paper: Paper; loading: boolean }) {
  const meta = [paper.year, paper.source, typeLabel(paper.type), languageName(paper.language)].filter(Boolean);
  return (
    <article className="fp-detail">
      {paper.isRetracted && (
        <p className="fp-retracted" role="alert">
          <Icon name="alert" />
          <span>
            <b>This paper has been retracted.</b> Its findings should not be relied on or cited as valid.
          </span>
        </p>
      )}
      <h2 className="fp-detail-title" id="fp-preview-title">
        {paper.title}
      </h2>
      <p className="fp-detail-authors">
        {paper.authors.length
          ? paper.authors.map((a, i) => (
              <span key={`${a.name}-${i}`}>
                {a.orcid ? (
                  <a href={`https://orcid.org/${a.orcid}`} target="_blank" rel="noopener noreferrer" title={`ORCID ${a.orcid}`}>
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
                {i < paper.authors.length - 1 ? ', ' : ''}
              </span>
            ))
          : 'No authors listed'}
      </p>
      {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}

      <div className="fp-detail-facts">
        <span className="tag">{citationLabel(paper.citedByCount)}</span>
        {paper.isOpenAccess && <span className="tag oa">Open access</span>}
        {paper.isRetracted && <span className="tag retracted">Retracted</span>}
      </div>

      <div className="fp-detail-links">
        <SaveButton paper={paper} menuAlign="left" />
        {paper.pdfUrl && (
          <a className="btn btn-thread btn-sm" href={paper.pdfUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="pdf" /> Free PDF
          </a>
        )}
        {!paper.pdfUrl && paper.landingUrl && (
          <a className="btn btn-ghost btn-sm" href={paper.landingUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Publisher page
          </a>
        )}
        <PaperLinks paper={paper} both />
      </div>

      <section className="fp-detail-sec" aria-labelledby="fp-abs-h">
        <h3 id="fp-abs-h">Abstract</h3>
        {paper.abstract ? <p className="fp-detail-abstract">{paper.abstract}</p> : <p className="fp-abstract is-empty">No abstract available.</p>}
      </section>

      {(paper.topics.length > 0 || loading) && (
        <section className="fp-detail-sec" aria-labelledby="fp-top-h">
          <h3 id="fp-top-h">Topics and keywords</h3>
          {paper.topics.length ? (
            <ul className="fp-topics">
              {paper.topics.map((t) => (
                <li key={t} className="tag">
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <span className="spin" aria-label="Loading" />
          )}
        </section>
      )}
    </article>
  );
}
