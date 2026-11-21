'use client';

import type { Collection } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { SearchPill } from './SearchPill';
import { COLLECTION_LABELS, type ShelfFilters } from './shelf-state';

/* The shelf's heading: "Collection · Library", the view's title (the
   collection, or a project, folder or tag inside it), what the collection
   holds, and on the right the search and Add papers. */
export function ShelfHead({
  collection,
  view,
  filters,
  onFilters,
  onAdd,
}: {
  collection: Collection | null;
  view: string | null;
  filters: ShelfFilters;
  onFilters: (p: Partial<ShelfFilters>) => void;
  onAdd: () => void;
}) {
  const c = collection ? COLLECTION_LABELS[collection] : null;
  return (
    <header className="sh-head">
      <div className="sh-head-text">
        <span className="sh-eyebrow">{c ? (view ? c.name : `Collection · ${c.name}`) : 'Shelf'}</span>
        <h1 className="sh-h1">{view ?? c?.name}</h1>
        {c && !view && <p className="sh-lede">{c.lede}</p>}
      </div>
      <div className="sh-head-acts">
        {c && <SearchPill filters={filters} placeholder={collection === 'uploads' ? 'Search your files' : 'Search the library'} onChange={onFilters} />}
        <button type="button" className="btn btn-thread sh-add-btn" onClick={onAdd}>
          <Icon name="plus" /> Add papers
        </button>
      </div>
    </header>
  );
}
