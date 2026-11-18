'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ListSort } from '@/lib/shelf/store/list-query';
import type { ReadingStatus, ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { toast } from '../toast';
import { shelfFetch } from './api';
import { markSaved } from './saved-store';
import { ShelfCard } from './ShelfCard';
import { filtersFromParams, filtersToParams, SORT_LABELS, type ShelfFilters } from './shelf-state';
import { useShelfList } from './useShelfList';

/* The shelf page: every saved paper, newest first. */
export function Shelf({ initialQuery, focusItem }: { initialQuery: string; focusItem: string | null }) {
  const [filters, setFilters] = useState<ShelfFilters>(() => filtersFromParams(new URLSearchParams(initialQuery)));
  const query = useMemo(() => filtersToParams(filters).toString(), [filters]);
  const list = useShelfList(query);
  const [focus, setFocus] = useState(focusItem);

  // keep the address bar in step (back, reload, share)
  useEffect(() => {
    const url = query ? `/shelf?${query}` : '/shelf';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [query]);

  // arriving from a "Saved" link: bring that paper into view
  useEffect(() => {
    if (!focus || list.status !== 'ready') return;
    document.getElementById(`item-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, list.status]);

  const setStatus = async (item: ShelfItem, readingStatus: ReadingStatus) => {
    list.replace({ ...item, readingStatus });
    try {
      list.replace(await shelfFetch<ShelfItem>(`/api/shelf/papers/${item.id}`, { method: 'PATCH', body: { readingStatus } }));
    } catch (e) {
      list.replace(item);
      toast((e as Error).message, true);
    }
  };

  const remove = async (item: ShelfItem) => {
    if (!window.confirm(`Remove “${item.paper.title}” from your shelf?`)) return;
    try {
      await shelfFetch(`/api/shelf/papers/${item.id}`, { method: 'DELETE' });
      list.drop([item.id]);
      if (item.paper.openalexId) markSaved(item.paper.openalexId, null);
      toast('Removed from your shelf');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="sh">
      <section className="fp-results" aria-label="Saved papers">
        <div className="fp-results-head">
          <p className="fp-count" role="status">
            {list.status === 'loading' ? 'Loading…' : `${formatCount(list.total)} paper${list.total === 1 ? '' : 's'}`}
          </p>
          <label className="fp-sort">
            Sort
            <select className="select" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as ListSort })}>
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        {list.status === 'loading' ? (
          <div className="fp-loading" role="status" aria-label="Loading your shelf">
            {[0, 1, 2].map((i) => (
              <div key={i} className="hist-loading fp-skel" />
            ))}
          </div>
        ) : list.status === 'error' && !list.items.length ? (
          <div className="fp-error" role="alert">
            <Icon name="alert" />
            <p>{list.error?.message}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={list.reload}>
              Try again
            </button>
          </div>
        ) : !list.items.length ? (
          <div className="lib-empty fp-empty">
            <Icon name="layers" />
            <h2 className="h3">Your shelf is empty</h2>
            <p>Save papers from Find Papers and they stay here until you remove them.</p>
            <a className="btn btn-thread btn-sm" href="/papers">
              <Icon name="search" /> Find papers
            </a>
          </div>
        ) : (
          <>
            <ol className="fp-list">
              {list.items.map((item) => (
                <ShelfCard key={item.id} item={item} active={focus === item.id} onStatus={setStatus} onRemove={remove} />
              ))}
            </ol>
            {list.hasMore && (
              <div className="fp-more">
                <button type="button" className="btn btn-ghost" onClick={() => (setFocus(null), list.loadMore())} disabled={list.status === 'more'}>
                  {list.status === 'more' ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" />}
                  {list.status === 'more' ? 'Loading…' : 'Load more'}
                </button>
                <span className="small">
                  Showing {formatCount(list.items.length)} of {formatCount(list.total)}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
