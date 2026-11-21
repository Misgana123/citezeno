import { LIST_SORTS, type ListSort } from '@/lib/shelf/store/list-query';
import { COLLECTIONS, READING_STATUSES, type Collection, type ReadingStatus } from '@/lib/shelf/types';

/* The shelf view's filters, kept in the address bar so back, reload and links work. */

export type ShelfFilters = {
  /* Library (found by Citezeno) or My uploads; every view is inside one */
  collection: Collection;
  q: string;
  project: string; // a project ID, "unsorted", or "" for everything
  folder: string;
  tag: string;
  status: ReadingStatus | '';
  from: string;
  to: string;
  oa: boolean;
  retracted: boolean;
  pdf: boolean;
  /* My uploads: matched to a known paper ("yes"), the user's own documents ("no"), or both ("") */
  matched: '' | 'yes' | 'no';
  /* opened and not finished */
  wip: boolean;
  sort: ListSort;
  /* the possible-duplicates view instead of a list */
  dups: boolean;
};

export const EMPTY_FILTERS: ShelfFilters = { collection: 'library', q: '', project: '', folder: '', tag: '', status: '', from: '', to: '', oa: false, retracted: false, pdf: false, matched: '', wip: false, sort: 'added_desc', dups: false };

const one = (v: string | null) => (v ?? '').trim();

export function filtersFromParams(p: URLSearchParams): ShelfFilters {
  const status = one(p.get('status'));
  const sort = one(p.get('sort'));
  const year = (v: string) => (/^\d{4}$/.test(v) ? v : '');
  const c = one(p.get('c'));
  return {
    collection: (COLLECTIONS as readonly string[]).includes(c) ? (c as Collection) : 'library',
    q: one(p.get('q')).slice(0, 500),
    project: one(p.get('project')),
    folder: one(p.get('folder')),
    tag: one(p.get('tag')),
    status: (READING_STATUSES as readonly string[]).includes(status) ? (status as ReadingStatus) : '',
    from: year(one(p.get('from'))),
    to: year(one(p.get('to'))),
    oa: p.get('oa') === '1',
    retracted: p.get('retracted') === '1',
    pdf: p.get('pdf') === '1',
    matched: p.get('matched') === '1' ? 'yes' : p.get('matched') === '0' ? 'no' : '',
    wip: p.get('wip') === '1',
    sort: (LIST_SORTS as readonly string[]).includes(sort) ? (sort as ListSort) : 'added_desc',
    dups: p.get('dups') === '1',
  };
}

/* Only what differs from the defaults, so URLs stay short (Library is the
   default collection; listing requests name it, see listParams). */
export function filtersToParams(f: ShelfFilters, extra: Record<string, string | number> = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (f.collection !== 'library') p.set('c', f.collection);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.project) p.set('project', f.project);
  if (f.folder) p.set('folder', f.folder);
  if (f.tag) p.set('tag', f.tag);
  if (f.status) p.set('status', f.status);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.oa) p.set('oa', '1');
  if (f.retracted) p.set('retracted', '1');
  if (f.pdf) p.set('pdf', '1');
  if (f.matched) p.set('matched', f.matched === 'yes' ? '1' : '0');
  if (f.wip) p.set('wip', '1');
  if (f.sort !== 'added_desc') p.set('sort', f.sort);
  if (f.dups) p.set('dups', '1');
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p;
}

/* The listing request for a view: always names its collection, so Library
   never shows uploads. */
export const listParams = (f: ShelfFilters) => filtersToParams(f, { c: f.collection });

export const COLLECTION_LABELS: Record<Collection, { name: string; hint: string; lede: string }> = {
  library: { name: 'Library', hint: 'Found by Citezeno', lede: 'Papers Citezeno found for you, from search, DOI, links and imported references.' },
  uploads: { name: 'My uploads', hint: 'Your own files', lede: 'Your own PDFs: course notes, reports and papers you brought. Read, highlight and ask about them.' },
};

/* Filters beyond the project / folder / tag the sidebar picks. */
export const activeFilterCount = (f: ShelfFilters) => [f.status, f.from, f.to, f.oa, f.retracted, f.pdf, f.matched, f.wip].filter(Boolean).length;

export const STATUS_LABELS: Record<ReadingStatus, string> = { to_read: 'To read', reading: 'Reading', done: 'Done' };

export const SORT_LABELS: Record<ListSort, string> = {
  relevance: 'Best match',
  added_desc: 'Recently added',
  added_asc: 'Oldest added',
  year_desc: 'Year (newest)',
  year_asc: 'Year (oldest)',
  title: 'Title',
  cited: 'Most cited',
};
