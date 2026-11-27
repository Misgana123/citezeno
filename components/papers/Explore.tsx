'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExploreSort } from '@/lib/papers/explore/query';
import type { ExploreList } from '@/lib/papers/explore/types';
import type { SortKey } from '@/lib/papers/search/options';
import type { PaperList } from '@/lib/papers/search/types';
import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { useMediaQuery } from '../useMediaQuery';
import { exploreUrl, listUrl } from './api';
import { appliedFilters, clearAll, exploreFromParams, exploreToParams, feedParams, searchParams, toSearchState, type ExploreState } from './exploreState';
import { FacetSidebar } from './FacetSidebar';
import { formatCount, languageName, sourceLabel, typeLabel } from './format';
import { GalleryCard } from './GalleryCard';
import { ModeSwitch } from './ModeSwitch';
import { noticeText } from './notices';
import { PaperPreview } from './PaperPreview';
import { SearchBox } from './SearchBox';
import { SubjectChips } from './SubjectChips';
import { useExploreFacets } from './useExploreFacets';
import { usePaperList } from './usePaperList';

/* The Explore page (/app/papers): a gallery of papers to browse, with shop-style
   filters and counts, subject chips and sort tabs; searching shows results in
   the same gallery. The feed comes from our own copy of papers (no outside
   calls); search works as before. Everything chosen lives in the page URL. */

const FEED_TABS: { id: ExploreSort; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'cited', label: 'Most cited' },
  { id: 'newest', label: 'Newest' },
  { id: 'free', label: 'Free to read' },
];
const SEARCH_TABS: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Best match' },
  { id: 'cited', label: 'Most cited' },
  { id: 'newest', label: 'Newest' },
];

type AnyList = (ExploreList | PaperList) & { from?: ExploreList['from']; notices?: PaperList['notices']; mode?: PaperList['mode'] };

export function Explore({ initialQuery, maxQueryChars }: { initialQuery: string; maxQueryChars: number }) {
  const initial = useMemo(() => exploreFromParams(new URLSearchParams(initialQuery)), [initialQuery]);
  const [state, setState] = useState<ExploreState>(initial);
  const [text, setText] = useState(initial.q);
  const [preview, setPreview] = useState<Paper | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  const searching = !!state.q.trim();
  const pageKey = exploreToParams(state).toString();

  // the feed, or search results: the same paged list, from two endpoints
  const buildUrl = useMemo(
    () => (page: number) => (searching ? listUrl('search', searchParams(state, page)) : exploreUrl(feedParams(state, page))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageKey],
  );
  const list = usePaperList<AnyList>(buildUrl);
  const { facets } = useExploreFacets(searching ? null : feedParams(state));

  // keep the address bar in step (back, reload, share)
  useEffect(() => {
    const url = pageKey ? `/app/papers?${pageKey}` : '/app/papers';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [pageKey]);
  useEffect(() => () => void (debounce.current && clearTimeout(debounce.current)), []);

  /* Change what is shown; dragged or typed values wait a moment. */
  const patch = useCallback((p: Partial<ExploreState>, { typed = false } = {}) => {
    if (debounce.current) clearTimeout(debounce.current);
    const apply = () => setState((s) => ({ ...s, ...p }));
    if (typed) debounce.current = setTimeout(apply, 350);
    else apply();
  }, []);

  const search = () => patch({ q: text.trim() });
  const backToFeed = () => {
    setText('');
    patch({ q: '' });
  };

  // load more as the end of the gallery comes into view
  const sentinel = useRef<HTMLDivElement>(null);
  const { status, meta, loadMore } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !meta?.hasMore || status !== 'ready') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [meta?.hasMore, status, loadMore]);

  const dock = useMediaQuery('(min-width: 1280px)');
  const sideFilters = useMediaQuery('(min-width: 961px)');
  const applied = appliedFilters(state, { type: (t) => typeLabel(t) ?? t, source: sourceLabel, lang: (l) => languageName(l) ?? l }, searching);
  const total = meta?.total ?? 0;

  const sidebar = <FacetSidebar state={state} facets={searching ? null : facets} searching={searching} onChange={patch} />;

  return (
    <div className={`ex${preview && dock ? ' has-dock' : ''}`}>
      <div className="ex-main">
        <header className="ex-head">
          <div>
            <div className="ex-eyebrow">Explore</div>
            <h1 className="ex-title">
              Discover <em>research</em>, then dig in.
            </h1>
          </div>
        </header>

        <div className="ex-top">
          <div className="ex-searchbar">
            <SearchBox
              className="fp-search ex-search"
              value={text}
              onChange={setText}
              onSubmit={search}
              maxChars={maxQueryChars}
              busy={searching && status === 'loading'}
              placeholder={facets?.total ? `Search ${formatCount(facets.total)}+ papers — keywords, a question, or paste your project aim` : 'Search papers — keywords, a question, or paste your project aim'}
              extra={<ModeSwitch compact value={state.mode} onChange={(mode) => patch({ mode })} />}
            />
          </div>
          {searching ? (
            <div className="ex-searching">
              <span>
                Results for <b>“{state.q.length > 80 ? `${state.q.slice(0, 80)}…` : state.q}”</b>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={backToFeed}>
                <Icon name="compass" /> Back to Explore
              </button>
            </div>
          ) : (
            <SubjectChips value={state.subject} facets={facets} onChange={(subject) => patch({ subject })} />
          )}
        </div>

        <div className="ex-layout">
          {sideFilters && !(preview && dock) && <aside className="ex-side">{sidebar}</aside>}

          <section className="ex-results" aria-label={searching ? 'Search results' : 'Papers'}>
            <div className="ex-bar">
              <div className="ex-tabs" role="tablist" aria-label="Order">
                {(searching ? SEARCH_TABS : FEED_TABS).map((t) => {
                  const on = searching ? state.order === t.id : state.sort === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => patch(searching ? { order: t.id as SortKey } : { sort: t.id as ExploreSort })}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {(!sideFilters || (preview && dock)) && (
                <button type="button" className="btn btn-ghost btn-sm ex-filters-btn" onClick={() => setFiltersOpen(true)}>
                  <Icon name="sliders" /> Filters{applied.length > 0 && <b className="fp-filter-count">{applied.length}</b>}
                </button>
              )}
              {meta && (
                <span className="ex-total" role="status">
                  {formatCount(total)} {searching && meta.mode !== 'keyword' ? `best match${total === 1 ? '' : 'es'}` : `paper${total === 1 ? '' : 's'}`}
                </span>
              )}
            </div>

            {applied.length > 0 && (
              <div className="ex-applied">
                {applied.map((f) => (
                  <span key={f.key} className="ex-pill">
                    {f.label}
                    <button type="button" onClick={() => patch(f.clear)} aria-label={`Remove ${f.label}`}>
                      <Icon name="x" />
                    </button>
                  </span>
                ))}
                <button type="button" className="ex-clear" onClick={() => setState((s) => clearAll(s))}>
                  Clear all
                </button>
              </div>
            )}

            {searching && meta?.notices && meta.notices.length > 0 && (
              <ul className="fp-notices">
                {meta.notices.map((n) => (
                  <li key={n}>
                    <Icon name="help" /> {noticeText(n, { mode: meta.mode ?? 'smart', total, maxQueryChars })}
                  </li>
                ))}
              </ul>
            )}
            {!searching && meta?.from === 'live' && list.papers.length > 0 && (
              <p className="ex-live-note">
                <Icon name="help" /> Showing well-known papers while our collection fills up. Filter counts appear once it is ready.
              </p>
            )}

            <Gallery list={list} activeId={preview?.id} onOpen={setPreview} searching={searching} onClear={() => setState((s) => clearAll(s))} hasFilters={applied.length > 0 || !!state.subject} />
            <div ref={sentinel} className="ex-sentinel" aria-hidden="true" />
            {status === 'more' && (
              <div className="ex-loadmore" role="status">
                <span className="spin" aria-hidden="true" /> Loading more
              </div>
            )}
            {status === 'error' && list.papers.length > 0 && (
              <div className="ex-loadmore">
                <button type="button" className="btn btn-ghost btn-sm" onClick={list.retry}>
                  Couldn’t load more. Try again
                </button>
              </div>
            )}
            {meta && !meta.hasMore && list.papers.length > 0 && status === 'ready' && <p className="ex-end">That’s everything for these filters.</p>}
          </section>
        </div>
      </div>

      {preview && <PaperPreview paper={preview} filters={toSearchState(state)} maxQueryChars={maxQueryChars} onClose={closePreview} docked={dock} />}

      {filtersOpen && (
        <div className="drawer-wrap" onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}>
          <aside className="drawer ex-drawer" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="fp-drawer-head">
              <span className="fp-drawer-kicker">Filters</span>
              <button type="button" className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close the filters">
                <Icon name="x" />
              </button>
            </div>
            <div className="fp-drawer-body">{sidebar}</div>
            <div className="ex-drawer-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setState((s) => clearAll(s))}>
                Clear all
              </button>
              <button type="button" className="btn btn-thread" onClick={() => setFiltersOpen(false)}>
                Show {formatCount(total)} papers
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* The cards, with loading, error and empty states. */
function Gallery({
  list,
  activeId,
  onOpen,
  searching,
  onClear,
  hasFilters,
}: {
  list: ReturnType<typeof usePaperList<AnyList>>;
  activeId?: string;
  onOpen: (p: Paper) => void;
  searching: boolean;
  onClear: () => void;
  hasFilters: boolean;
}) {
  const { status, papers, error } = list;
  if (status === 'loading' || status === 'idle')
    return (
      <div className="ex-grid" role="status" aria-label="Loading papers">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ex-card ex-skel hist-loading" />
        ))}
      </div>
    );
  if (status === 'error' && !papers.length)
    return (
      <div className="fp-error" role="alert">
        <Icon name="alert" />
        <p>{error?.message ?? 'Papers could not be loaded.'}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={list.retry}>
          Try again
        </button>
      </div>
    );
  if (!papers.length)
    return (
      <div className="lib-empty ex-empty">
        <Icon name={searching ? 'search' : 'compass'} />
        <h2 className="h3">{searching ? 'No papers found' : 'Nothing here yet'}</h2>
        <p>{hasFilters ? 'Try removing some filters.' : searching ? 'Try different words, or Smart mode.' : 'Papers appear here as our collection fills up.'}</p>
        {hasFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    );
  return (
    <div className="ex-grid">
      {papers.map((p) => (
        <GalleryCard key={p.id} paper={p} onOpen={onOpen} active={activeId === p.id} />
      ))}
    </div>
  );
}
