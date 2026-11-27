import { EXPLORE_SORTS, type ExploreSort } from '@/lib/papers/explore/query';
import { SEARCH_MODES, SORTS, WORK_TYPES, type SearchMode, type SortKey, type WorkType } from '@/lib/papers/search/options';
import { DEFAULT_STATE, type SearchState } from './state';

/* The Explore page, as the browser holds it. It lives in the page URL (back,
   reload and shared links keep it). Without a search text the page shows the
   feed; with one, search results, in the same gallery and with the same filters
   (those search can apply). */

export type ExploreState = {
  q: string;
  mode: SearchMode;
  sort: ExploreSort; // the feed's order
  order: SortKey; // search results' order
  subject: string;
  types: WorkType[];
  sources: string[];
  from: string; // years stay strings while chosen
  to: string;
  oa: boolean;
  pdf: boolean;
  abstract: boolean;
  minCites: '' | '10' | '100' | '1000';
  lang: string;
};

export const DEFAULT_EXPLORE: ExploreState = {
  q: '',
  mode: 'smart',
  sort: 'trending',
  order: 'relevance',
  subject: '',
  types: [],
  sources: [],
  from: '',
  to: '',
  oa: false,
  pdf: false,
  abstract: false,
  minCites: '',
  lang: '',
};

const pick = <T extends string>(v: string | null | undefined, list: readonly T[], fallback: T): T =>
  v != null && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const year = (v: string | null) => (v && /^\d{4}$/.test(v) ? v : '');
const flag = (v: string | null) => v === '1' || v === 'true';
const list = (p: URLSearchParams, key: string) => [...new Set(p.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean))];

export function exploreFromParams(p: URLSearchParams): ExploreState {
  return {
    q: p.get('q') ?? '',
    mode: pick(p.get('mode'), SEARCH_MODES, 'smart'),
    sort: pick(p.get('sort'), EXPLORE_SORTS, 'trending'),
    order: pick(p.get('order'), SORTS, 'relevance'),
    subject: (p.get('subject') ?? '').slice(0, 80),
    types: list(p, 'type').filter((t): t is WorkType => (WORK_TYPES as readonly string[]).includes(t)),
    sources: list(p, 'source').filter((s) => /^[a-z][a-z0-9-]{0,31}$/.test(s)),
    from: year(p.get('from')),
    to: year(p.get('to')),
    oa: flag(p.get('oa')),
    pdf: flag(p.get('pdf')),
    abstract: flag(p.get('abstract')),
    minCites: pick(p.get('minCites'), ['', '10', '100', '1000'] as const, ''),
    lang: /^[a-z]{2}$/.test(p.get('lang') ?? '') ? (p.get('lang') as string) : '',
  };
}

/* The filters both the feed and search share, as query parameters. */
function shared(s: ExploreState, p: URLSearchParams) {
  for (const t of s.types) p.append('type', t);
  if (s.from) p.set('from', s.from);
  if (s.to) p.set('to', s.to);
  if (s.oa) p.set('oa', '1');
  if (s.abstract) p.set('abstract', '1');
  if (s.minCites) p.set('minCites', s.minCites);
  if (s.lang) p.set('lang', s.lang);
}

/* The page URL: everything that differs from the defaults. */
export function exploreToParams(s: ExploreState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q.trim()) p.set('q', s.q.trim());
  if (s.mode !== 'smart') p.set('mode', s.mode);
  if (s.sort !== 'trending') p.set('sort', s.sort);
  if (s.order !== 'relevance') p.set('order', s.order);
  if (s.subject) p.set('subject', s.subject);
  for (const src of s.sources) p.append('source', src);
  if (s.pdf) p.set('pdf', '1');
  shared(s, p);
  return p;
}

/* /api/papers/explore (and its counts): the feed's filters, sort and page. */
export function feedParams(s: ExploreState, page = 1): URLSearchParams {
  const p = new URLSearchParams();
  if (s.subject) p.set('subject', s.subject);
  if (s.sort !== 'trending') p.set('sort', s.sort);
  for (const src of s.sources) p.append('source', src);
  if (s.pdf) p.set('pdf', '1');
  shared(s, p);
  if (page > 1) p.set('page', String(page));
  return p;
}

/* /api/papers/search: the text, mode, order and the filters search can apply. */
export function searchParams(s: ExploreState, page = 1): URLSearchParams {
  const p = new URLSearchParams();
  p.set('q', s.q.trim());
  if (s.mode !== 'smart') p.set('mode', s.mode);
  if (s.order !== 'relevance') p.set('sort', s.order);
  shared(s, p);
  if (page > 1) p.set('page', String(page));
  return p;
}

/* The search form's shape (the preview's related lists take their filters from it). */
export function toSearchState(s: ExploreState): SearchState {
  return {
    ...DEFAULT_STATE,
    q: s.q,
    mode: s.mode,
    sort: s.order,
    from: s.from,
    to: s.to,
    oa: s.oa,
    type: s.types.length === 1 ? s.types[0] : '',
    lang: s.lang,
    abstract: s.abstract,
    minCites: s.minCites,
  };
}

/* The filters set, one pill each (the subject chip and the sort tabs are shown on their own). */
export type AppliedFilter = { key: string; label: string; clear: Partial<ExploreState> };

export function appliedFilters(s: ExploreState, labels: { type(t: WorkType): string; source(s: string): string; lang(l: string): string }, searching: boolean): AppliedFilter[] {
  const out: AppliedFilter[] = s.types.map((t) => ({ key: `type:${t}`, label: labels.type(t), clear: { types: s.types.filter((x) => x !== t) } }));
  if (s.from || s.to) out.push({ key: 'years', label: s.from && s.to ? `${s.from} – ${s.to}` : s.from ? `From ${s.from}` : `Until ${s.to}`, clear: { from: '', to: '' } });
  if (s.oa) out.push({ key: 'oa', label: 'Open access', clear: { oa: false } });
  if (s.pdf && !searching) out.push({ key: 'pdf', label: 'Has free PDF', clear: { pdf: false } });
  if (s.abstract) out.push({ key: 'abstract', label: 'Has abstract', clear: { abstract: false } });
  if (!searching) for (const src of s.sources) out.push({ key: `source:${src}`, label: labels.source(src), clear: { sources: s.sources.filter((x) => x !== src) } });
  if (s.minCites) out.push({ key: 'cites', label: `${Number(s.minCites).toLocaleString('en-US')}+ citations`, clear: { minCites: '' } });
  if (s.lang) out.push({ key: 'lang', label: labels.lang(s.lang), clear: { lang: '' } });
  return out;
}

export const clearAll = (s: ExploreState): ExploreState => ({ ...DEFAULT_EXPLORE, q: s.q, mode: s.mode, sort: s.sort, order: s.order, subject: s.subject });
