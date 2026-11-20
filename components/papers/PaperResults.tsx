'use client';

import type { ReactNode } from 'react';
import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { formatCount } from './format';
import { noticeText } from './notices';
import { PaperCard } from './PaperCard';
import type { PaperListState } from './usePaperList';

/* A paper list with its loading, error and empty states, the result count,
   notices, the cards and "Load more". Used by the main search and the
   related-paper lists. */
export function PaperResults({
  list,
  maxQueryChars,
  onOpen,
  activeId,
  toolbar,
  empty,
  countLabel,
}: {
  list: PaperListState;
  maxQueryChars: number;
  onOpen?: (p: Paper) => void;
  activeId?: string | null;
  toolbar?: ReactNode;
  empty: ReactNode;
  countLabel?: (total: number) => string;
}) {
  const { status, papers, meta, error } = list;

  if (status === 'idle') return null;
  if (status === 'loading') return <ResultsLoading />;
  if (status === 'error' && !papers.length) return <ResultsError error={error} onRetry={list.retry} />;
  if (meta && !papers.length) return <>{empty}</>;

  const total = meta?.total ?? papers.length;
  const label = countLabel
    ? countLabel(total)
    : meta?.mode === 'keyword'
      ? `${formatCount(total)} paper${total === 1 ? '' : 's'} found`
      : `${formatCount(total)} best match${total === 1 ? '' : 'es'}`;

  return (
    <section className="fp-results" aria-label="Results">
      <div className="fp-results-head">
        <p className="fp-count" role="status">
          {label}
        </p>
        {toolbar}
      </div>
      {meta && meta.notices.length > 0 && (
        <ul className="fp-notices">
          {meta.notices.map((n) => (
            <li key={n}>
              <Icon name="help" /> {noticeText(n, { mode: meta.mode, total, maxQueryChars })}
            </li>
          ))}
        </ul>
      )}
      <ol className="fp-list">
        {papers.map((p) => (
          <PaperCard key={p.id} paper={p} onOpen={onOpen} active={activeId === p.id} />
        ))}
      </ol>
      {status === 'error' && <ResultsError error={error} onRetry={list.retry} inline />}
      {meta?.hasMore && status !== 'error' && (
        <div className="fp-more">
          <button type="button" className="btn btn-ghost" onClick={list.loadMore} disabled={status === 'more'}>
            {status === 'more' ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" />}
            {status === 'more' ? 'Loading…' : 'Load more'}
          </button>
          <span className="small">
            Showing {formatCount(papers.length)} of {formatCount(total)}
          </span>
        </div>
      )}
    </section>
  );
}

export function ResultsLoading() {
  return (
    <div className="fp-loading" role="status" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <div key={i} className="hist-loading fp-skel" />
      ))}
    </div>
  );
}

function ResultsError({ error, onRetry, inline = false }: { error: PaperListState['error']; onRetry: () => void; inline?: boolean }) {
  if (!error) return null;
  const canRetry = error.code !== 'user_limit' && error.code !== 'bad_request' && error.code !== 'signed_out';
  return (
    <div className={`fp-error${inline ? ' is-inline' : ''}`} role="alert">
      <Icon name="alert" />
      <p>{error.message}</p>
      {error.code === 'signed_out' && (
        <a className="btn btn-ghost btn-sm" href={`/sign-in?next=${encodeURIComponent('/app/papers')}`}>
          Sign in
        </a>
      )}
      {canRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
