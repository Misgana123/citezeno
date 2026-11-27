import { SEARCH_MODES, SORTS, WORK_TYPES, type SearchMode, type SortKey, type WorkType } from '@/lib/papers/search/options';

/* The Find Papers form, as the browser holds it. It round-trips through the
   page URL (so back, reload and shared links keep the search) and becomes the
   query string the /api/papers routes read. */

export type SearchState = {
  q: string;
  mode: SearchMode;
  sort: SortKey;
  from: string; // years stay strings while typed
  to: string;
  oa: boolean;
  type: WorkType | '';
  lang: string;
  abstract: boolean;
  retracted: boolean; // show retracted papers (hidden by default)
  minCites: string;
};

export const DEFAULT_STATE: SearchState = {
  q: '',
  mode: 'smart',
  sort: 'relevance',
  from: '',
  to: '',
  oa: false,
  type: '',
  lang: '',
  abstract: false,
  retracted: false,
  minCites: '',
};

const pick = <T extends string>(v: string | null | undefined, list: readonly T[], fallback: T): T =>
  v != null && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const digits = (v: string | null | undefined, max: number) => (v && /^\d+$/.test(v) ? v.slice(0, max) : '');
const flag = (v: string | null | undefined) => v === '1' || v === 'true';

/* URL search params → form state, ignoring anything malformed. */
export function stateFromParams(p: URLSearchParams): SearchState {
  return {
    q: p.get('q') ?? '',
    mode: pick(p.get('mode'), SEARCH_MODES, 'smart'),
    sort: pick(p.get('sort'), SORTS, 'relevance'),
    from: digits(p.get('from'), 4),
    to: digits(p.get('to'), 4),
    oa: flag(p.get('oa')),
    type: pick<WorkType | ''>(p.get('type'), WORK_TYPES, ''),
    lang: /^[a-z]{2}$/.test(p.get('lang') ?? '') ? (p.get('lang') as string) : '',
    abstract: flag(p.get('abstract')),
    retracted: flag(p.get('retracted')),
    minCites: digits(p.get('minCites'), 7),
  };
}

/* Form state → query string. Defaults are left out to keep URLs short.
   `withQuery: false` drops the text (related lists don't use it). */
export function stateToParams(s: SearchState, { page = 1, withQuery = true }: { page?: number; withQuery?: boolean } = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (withQuery && s.q.trim()) p.set('q', s.q.trim());
  if (s.mode !== 'smart') p.set('mode', s.mode);
  if (s.sort !== 'relevance') p.set('sort', s.sort);
  if (s.from) p.set('from', s.from);
  if (s.to) p.set('to', s.to);
  if (s.oa) p.set('oa', '1');
  if (s.type) p.set('type', s.type);
  if (s.lang) p.set('lang', s.lang);
  if (s.abstract) p.set('abstract', '1');
  if (s.retracted) p.set('retracted', '1');
  if (s.minCites && s.minCites !== '0') p.set('minCites', s.minCites);
  if (page > 1) p.set('page', String(page));
  return p;
}

/* How many filters differ from the defaults (shown on the Filters button). */
export function activeFilterCount(s: SearchState): number {
  return [s.from || s.to, s.oa, s.type, s.lang, s.abstract, s.retracted, s.minCites && s.minCites !== '0'].filter(Boolean).length;
}

export const clearFilters = (s: SearchState): SearchState => ({ ...DEFAULT_STATE, q: s.q, mode: s.mode, sort: s.sort });
