import { LIST_SORTS, type ListSort } from '@/lib/shelf/store/list-query';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';

/* The shelf view's filters, kept in the address bar so back, reload and links work. */

export type ShelfFilters = {
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
  sort: ListSort;
  /* the possible-duplicates view instead of a list */
  dups: boolean;
};

export const EMPTY_FILTERS: ShelfFilters = { q: '', project: '', folder: '', tag: '', status: '', from: '', to: '', oa: false, retracted: false, pdf: false, sort: 'added_desc', dups: false };

const one = (v: string | null) => (v ?? '').trim();

export function filtersFromParams(p: URLSearchParams): ShelfFilters {
  const status = one(p.get('status'));
  const sort = one(p.get('sort'));
  const year = (v: string) => (/^\d{4}$/.test(v) ? v : '');
  return {
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
    sort: (LIST_SORTS as readonly string[]).includes(sort) ? (sort as ListSort) : 'added_desc',
    dups: p.get('dups') === '1',
  };
}

/* Only what differs from the defaults, so URLs stay short. */
export function filtersToParams(f: ShelfFilters, extra: Record<string, string | number> = {}): URLSearchParams {
  const p = new URLSearchParams();
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
  if (f.sort !== 'added_desc') p.set('sort', f.sort);
  if (f.dups) p.set('dups', '1');
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p;
}

/* Filters beyond the project / folder / tag the sidebar picks. */
export const activeFilterCount = (f: ShelfFilters) => [f.status, f.from, f.to, f.oa, f.retracted, f.pdf].filter(Boolean).length;

export const STATUS_LABELS: Record<ReadingStatus, string> = { to_read: 'To read', reading: 'Reading', done: 'Done' };

export const SORT_LABELS: Record<ListSort, string> = {
  relevance: 'Best match',
  added_desc: 'Newest added',
  added_asc: 'Oldest added',
  year_desc: 'Year (newest)',
  year_asc: 'Year (oldest)',
  title: 'Title',
  cited: 'Most cited',
};
