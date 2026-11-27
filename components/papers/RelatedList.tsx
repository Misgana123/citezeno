'use client';

import { useMemo, useState } from 'react';
import type { SortKey } from '@/lib/papers/search/options';
import type { Paper } from '@/lib/papers/types';
import { listUrl } from './api';
import { PaperResults } from './PaperResults';
import { RELATED, type RelatedKind } from './related';
import { SortSelect } from './SortSelect';
import { activeFilterCount, type SearchState, stateToParams } from './state';
import { usePaperList } from './usePaperList';

/* One related list for a paper, with the main search's filters and its own sort. */
export function RelatedList({
  paperId,
  kind,
  filters,
  maxQueryChars,
  onOpen,
}: {
  paperId: string;
  kind: RelatedKind;
  filters: SearchState;
  maxQueryChars: number;
  onOpen: (p: Paper) => void;
}) {
  const [sort, setSort] = useState<SortKey>('relevance');
  const base = { ...filters, sort, mode: 'smart' as const };
  const key = stateToParams(base, { withQuery: false }).toString();
  const buildUrl = useMemo(
    () => (page: number) => listUrl(kind, stateToParams(base, { withQuery: false, page }), paperId),
    [paperId, kind, key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = usePaperList(buildUrl);
  const info = RELATED[kind];
  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="fp-related">
      {filtered && <p className="fp-related-note">Using the filters from your search.</p>}
      <PaperResults
        list={list}
        maxQueryChars={maxQueryChars}
        onOpen={onOpen}
        countLabel={info.count}
        toolbar={<SortSelect value={sort} onChange={setSort} relevanceLabel={kind === 'similar' ? 'Most similar' : 'Default order'} />}
        empty={
          <div className="drawer-empty">
            <p>{info.empty}</p>
          </div>
        }
      />
    </div>
  );
}
