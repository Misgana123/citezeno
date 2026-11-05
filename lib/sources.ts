/* Live source providers. All four are CORS-enabled public APIs that need no key. */
import type { ApiSettings, Kind, Name, ProviderKey, Source, SourceType } from './types';

export type SearchOpts = {
  yearFrom?: string;
  yearTo?: string;
  oaOnly?: boolean;
  kind?: Kind;
  limit?: number;
  settings?: ApiSettings;
};

/* ---------- helpers ---------- */
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function stripTags(s: unknown): string {
  if (!s) return '';
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const PARTICLES = /^(van|von|der|den|de|del|della|da|das|dos|du|di|la|le|ter|ten|bin|ibn|al|el|st\.?)$/i;
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

export function parseName(raw: string | null | undefined): Name | null {
  if (!raw) return null;
  raw = String(raw).replace(/\s+/g, ' ').trim();
  if (raw.includes(',')) {
    const [fam, ...rest] = raw.split(',');
    return { family: fam.trim(), given: rest.join(' ').trim() };
  }
  const parts = raw.split(' ');
  if (parts.length === 1) return { family: raw, given: '', literal: true };
  let suffix = '';
  if (SUFFIX.test(parts[parts.length - 1])) suffix = parts.pop() as string;
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.test(parts[i - 1])) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i).join(' '), suffix };
}

const normTitle = (t: string) => (t || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cleanTitle = (t: unknown) => stripTags(Array.isArray(t) ? t[0] : t).replace(/\s*[.:]\s*$/, '');

function pages(first?: string, last?: string) {
  if (!first) return '';
  if (String(first).includes('-')) return String(first).replace(/-+/, '–');
  return last && last !== first ? `${first}–${last}` : String(first);
}

async function getJSON(url: string, { timeout = 14000, retries = 1 } = {}): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) {
        if (attempt < retries) {
          await new Promise((res) => setTimeout(res, 900 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      if (attempt >= retries) throw e;
    }
  }
}

/* ---------- OpenAlex ---------- */
function rebuildAbstract(inv: Record<string, number[]> | null) {
  if (!inv) return '';
  const arr: string[] = [];
  for (const [w, pos] of Object.entries(inv)) pos.forEach((p) => (arr[p] = w));
  return arr.filter(Boolean).join(' ');
}

const OA_TYPE: Record<string, SourceType> = {
  article: 'article', review: 'article', 'book-chapter': 'chapter', book: 'book', dataset: 'dataset',
  preprint: 'preprint', dissertation: 'thesis', 'proceedings-article': 'proceedings', report: 'report',
};

function fromOpenAlex(w: any): Source {
  const loc = w.primary_location || {};
  const src = loc.source || {};
  const b = w.biblio || {};
  const doi = (w.doi || '').replace(/^https?:\/\/doi\.org\//i, '');
  return {
    provider: 'OpenAlex',
    providerId: w.id,
    type: OA_TYPE[w.type] || 'article',
    title: cleanTitle(w.display_name || w.title),
    authors: (w.authorships || [])
      .map((a: any) => parseName((a.author && a.author.display_name) || a.raw_author_name))
      .filter(Boolean),
    year: w.publication_year || null,
    date: w.publication_date || '',
    container: src.display_name || '',
    publisher: src.host_organization_name || '',
    volume: b.volume || '',
    issue: b.issue || '',
    pages: pages(b.first_page, b.last_page),
    doi,
    url: doi ? `https://doi.org/${doi}` : loc.landing_page_url || w.id,
    citedBy: w.cited_by_count || 0,
    oa: !!(w.open_access && w.open_access.is_oa),
    abstract: rebuildAbstract(w.abstract_inverted_index),
    keywords: (w.keywords || []).map((k: any) => k.display_name || k.keyword).filter(Boolean),
  };
}

async function openalex(query: string, opts: SearchOpts) {
  const f: string[] = [];
  if (opts.yearFrom) f.push(`from_publication_date:${opts.yearFrom}-01-01`);
  if (opts.yearTo) f.push(`to_publication_date:${opts.yearTo}-12-31`);
  if (opts.oaOnly) f.push('is_oa:true');
  if (opts.kind === 'books') f.push('type:book|book-chapter');
  else if (opts.kind === 'scholarly') f.push('type:article|review|book|book-chapter|preprint');
  f.push('has_doi:true');
  const sel =
    'id,doi,display_name,publication_year,publication_date,authorships,primary_location,biblio,cited_by_count,type,open_access,abstract_inverted_index,keywords';
  const s = opts.settings || {};
  const tail = `${s.email ? `&mailto=${encodeURIComponent(s.email)}` : ''}${s.openalexKey ? `&api_key=${encodeURIComponent(s.openalexKey)}` : ''}`;
  const per = opts.limit || 12;
  const clean = query.replace(/[,:|()"!]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1) match in titles and abstracts only, which keeps results on topic
  try {
    const tf = [...f, `title_and_abstract.search:${clean}`].join(',');
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(tf)}&sort=relevance_score:desc&per-page=${per}&select=${sel}${tail}`;
    const data = await getJSON(url);
    const out = (data.results || []).map(fromOpenAlex).filter((x: Source) => x.title);
    if (out.length) return out;
  } catch {
    /* fall through to the broader search */
  }
  // 2) broader search across titles, abstracts and full text
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(clean)}&per-page=${per}&select=${sel}&filter=${encodeURIComponent(f.join(','))}${tail}`;
  const data = await getJSON(url);
  return (data.results || []).map(fromOpenAlex).filter((x: Source) => x.title);
}

/* Fill in missing pages, volume, issue and publisher from Crossref, using the DOI. */
export async function enrich(src: Source, settings?: ApiSettings): Promise<Source> {
  if (!src.doi || (src.pages && src.volume && src.container)) return src;
  try {
    const mail = settings && settings.email ? `?mailto=${encodeURIComponent(settings.email)}` : '';
    const data = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(src.doi)}${mail}`, { timeout: 9000, retries: 0 });
    const c = fromCrossref(data.message);
    const out: Source = { ...src };
    (['pages', 'volume', 'issue', 'container', 'publisher', 'place', 'isbn'] as const).forEach((k) => {
      if (!out[k] && c[k]) (out as Record<string, unknown>)[k] = c[k];
    });
    if (!out.authors.length && c.authors.length) out.authors = c.authors;
    if (!out.year && c.year) out.year = c.year;
    if ((!out.date || out.date.length < 8) && c.date) out.date = c.date;
    return out;
  } catch {
    return src;
  }
}

/* ---------- Crossref ---------- */
const CR_TYPE: Record<string, SourceType> = {
  'journal-article': 'article', 'book-chapter': 'chapter', book: 'book', monograph: 'book', 'edited-book': 'book',
  'reference-book': 'book', 'proceedings-article': 'proceedings', 'posted-content': 'preprint', dataset: 'dataset',
  report: 'report', dissertation: 'thesis',
};

function fromCrossref(it: any): Source {
  const issued: number[] =
    (it.issued && it.issued['date-parts'] && it.issued['date-parts'][0]) ||
    (it.published && it.published['date-parts'] && it.published['date-parts'][0]) ||
    [];
  const authors = (it.author || [])
    .map((a: any) => (a.family ? { family: a.family, given: a.given || '' } : a.name ? { family: a.name, given: '', literal: true } : null))
    .filter(Boolean);
  const editors = (it.editor || []).map((a: any) => (a.family ? { family: a.family, given: a.given || '' } : null)).filter(Boolean);
  const date = issued.length
    ? [issued[0], String(issued[1] || 1).padStart(2, '0'), String(issued[2] || 1).padStart(2, '0')].join('-')
    : '';
  return {
    provider: 'Crossref',
    providerId: it.DOI,
    type: CR_TYPE[it.type] || 'article',
    title: cleanTitle(it.title) + (it.subtitle && it.subtitle[0] ? `: ${stripTags(it.subtitle[0])}` : ''),
    authors,
    editors,
    year: issued[0] || null,
    month: issued[1] || null,
    date: issued.length > 1 ? date : '',
    container: stripTags((it['container-title'] || [])[0] || ''),
    publisher: it.publisher || '',
    place: it['publisher-location'] || '',
    volume: it.volume || '',
    issue: it.issue || '',
    pages: pages(it.page),
    doi: it.DOI || '',
    url: it.DOI ? `https://doi.org/${it.DOI}` : it.URL,
    isbn: (it.ISBN || [])[0] || '',
    citedBy: it['is-referenced-by-count'] || 0,
    abstract: stripTags(it.abstract || ''),
    oa: false,
  };
}

async function crossref(query: string, opts: SearchOpts) {
  const f: string[] = [];
  if (opts.yearFrom) f.push(`from-pub-date:${opts.yearFrom}`);
  if (opts.yearTo) f.push(`until-pub-date:${opts.yearTo}`);
  if (opts.kind === 'books') f.push('type:book,type:book-chapter,type:monograph');
  else if (opts.kind === 'scholarly') f.push('type:journal-article,type:book,type:book-chapter,type:proceedings-article');
  const sel =
    'DOI,title,subtitle,author,editor,issued,published,container-title,volume,issue,page,type,publisher,publisher-location,is-referenced-by-count,URL,abstract,ISBN';
  let url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${opts.limit || 8}&select=${sel}`;
  if (f.length) url += `&filter=${encodeURIComponent(f.join(','))}`;
  const s = opts.settings || {};
  if (s.email) url += `&mailto=${encodeURIComponent(s.email)}`;
  const data = await getJSON(url);
  return ((data.message && data.message.items) || []).map(fromCrossref).filter((x: Source) => x.title && x.title.length > 3);
}

export async function crossrefDOI(doi: string) {
  doi = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  const data = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  return fromCrossref(data.message);
}

/* ---------- Open Library ---------- */
function fromOpenLibrary(d: any): Source {
  return {
    provider: 'Open Library',
    providerId: d.key,
    type: 'book',
    title: d.title + (d.subtitle ? `: ${d.subtitle}` : ''),
    authors: (d.author_name || []).slice(0, 12).map(parseName).filter(Boolean),
    year: d.first_publish_year || null,
    publisher: (d.publisher || [])[0] || '',
    place: (d.publish_place || [])[0] || '',
    isbn: (d.isbn || []).find((x: string) => x.length === 13) || (d.isbn || [])[0] || '',
    url: `https://openlibrary.org${d.key}`,
    citedBy: (d.edition_count || 0) * 3,
    abstract: (d.subject || []).slice(0, 25).join('; '),
    keywords: (d.subject || []).slice(0, 25),
    oa: false,
  };
}

const OL_FIELDS = 'key,title,subtitle,author_name,first_publish_year,publisher,publish_place,isbn,edition_count,subject';

async function openlibrary(query: string, opts: SearchOpts) {
  let q = query;
  if (opts.yearFrom || opts.yearTo) q += ` first_publish_year:[${opts.yearFrom || '*'} TO ${opts.yearTo || '*'}]`;
  const data = await getJSON(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${Math.min(opts.limit || 5, 6)}&fields=${OL_FIELDS}`,
  );
  return (data.docs || []).map(fromOpenLibrary).filter((x: Source) => x.title && x.authors.length);
}

export async function openlibraryISBN(isbn: string) {
  isbn = isbn.replace(/[^0-9Xx]/g, '');
  const data = await getJSON(`https://openlibrary.org/search.json?q=isbn:${isbn}&fields=${OL_FIELDS}`);
  if (!data.docs || !data.docs.length) throw new Error('ISBN not found in Open Library');
  const s = fromOpenLibrary(data.docs[0]);
  s.isbn = isbn;
  return s;
}

/* ---------- Wikipedia ---------- */
async function wikipedia(query: string, opts: SearchOpts): Promise<Source[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${Math.min(opts.limit || 3, 4)}&srprop=snippet|timestamp&format=json&origin=*`;
  const data = await getJSON(url);
  const today = new Date().toISOString().slice(0, 10);
  return ((data.query && data.query.search) || []).map((r: any) => {
    const ts = (r.timestamp || '').slice(0, 10);
    return {
      provider: 'Wikipedia',
      providerId: 'wiki:' + r.pageid,
      type: 'web' as SourceType,
      title: r.title,
      authors: [],
      site: 'Wikipedia',
      publisher: 'Wikimedia Foundation',
      year: ts ? +ts.slice(0, 4) : null,
      date: ts,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      accessed: today,
      abstract: stripTags(r.snippet),
      citedBy: 0,
      oa: true,
    };
  });
}

type Provider = {
  name: string;
  fn: (q: string, o: SearchOpts) => Promise<Source[]>;
  blurb: string;
  perClaim: number;
  words?: number;
};

export const PROVIDERS: Record<ProviderKey, Provider> = {
  openalex: { name: 'OpenAlex', fn: openalex, blurb: '250M+ scholarly works', perClaim: 12 },
  crossref: { name: 'Crossref', fn: crossref, blurb: 'The publishers’ DOI registry', perClaim: 6 },
  openlibrary: { name: 'Open Library', fn: openlibrary, blurb: 'Books and monographs', perClaim: 4, words: 3 },
  wikipedia: { name: 'Wikipedia', fn: wikipedia, blurb: 'Encyclopedia entries', perClaim: 3, words: 4 },
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

/* Query a provider, broadening the query once if nothing comes back. */
export async function search(key: ProviderKey, keywords: string[], opts: SearchOpts) {
  const p = PROVIDERS[key];
  let kws = keywords.slice(0, p.words || 6);
  let res = await p.fn(kws.join(' '), { ...opts, limit: p.perClaim });
  if (!res.length && kws.length > 3) {
    kws = kws.slice(0, 3);
    res = await p.fn(kws.join(' '), { ...opts, limit: p.perClaim });
  }
  return res;
}

export function keyOf(s: Source) {
  if (s.doi) return 'doi:' + s.doi.toLowerCase();
  return 't:' + normTitle(s.title).slice(0, 80) + ':' + (s.year || '');
}

export function merge(a: Source, b: Source): Source {
  const out: any = { ...a };
  for (const k of Object.keys(b)) {
    const va = out[k];
    const vb = (b as any)[k];
    if (va === undefined || va === null || va === '' || (Array.isArray(va) && !va.length)) out[k] = vb;
  }
  if ((b.abstract || '').length > (a.abstract || '').length) out.abstract = b.abstract;
  out.citedBy = Math.max(a.citedBy || 0, b.citedBy || 0);
  out.oa = a.oa || b.oa;
  out.providers = [...new Set([...(a.providers || [a.provider]), ...(b.providers || [b.provider])])];
  return out;
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: Error };

/* Run async tasks with a concurrency limit, reporting each one as it settles. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit: number, onDone?: (i: number, r: Settled<T>) => void) {
  const results: Settled<T>[] = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = { ok: true, value: await tasks[idx]() };
      } catch (e) {
        results[idx] = { ok: false, error: e as Error };
      }
      onDone && onDone(idx, results[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
