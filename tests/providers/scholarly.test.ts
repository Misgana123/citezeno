import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { arxivProvider } from '@/lib/providers/arxiv';
import { toArxivId } from '@/lib/providers/arxiv/ids';
import { fromFeed } from '@/lib/providers/arxiv/mapper';
import { searchQuery as arxivQuery } from '@/lib/providers/arxiv/query';
import { arxivSource } from '@/lib/providers/arxiv/source';
import { clinicalTrialsProvider } from '@/lib/providers/clinicaltrials';
import { toNctId } from '@/lib/providers/clinicaltrials/ids';
import { toPapers as ctPapers } from '@/lib/providers/clinicaltrials/mapper';
import { ctSource, filterParams as ctFilters, searchTerm as ctTerm } from '@/lib/providers/clinicaltrials/source';
import { toEpmcId } from '@/lib/providers/europepmc/ids';
import { toPapers as epmcPapers } from '@/lib/providers/europepmc/mapper';
import { searchQuery as epmcQuery, sortParam as epmcSort } from '@/lib/providers/europepmc/query';
import { epmcSource } from '@/lib/providers/europepmc/source';
import { cursorPage } from '@/lib/providers/papers/cursor';
import { httpError, requestKey, scholarlyBasics, scholarlyPolicy, scholarlyTransport, type ScholarlyRequest, type ScholarlyTransport } from '@/lib/providers/papers/http';
import { plain, searchWords } from '@/lib/providers/papers/parse';
import { PAPER_PROVIDERS } from '@/lib/providers/papers/registry';
import type { PaperFilters } from '@/lib/providers/papers/types';
import { pubmedProvider } from '@/lib/providers/pubmed';
import { toPmid } from '@/lib/providers/pubmed/ids';
import { fromFetch } from '@/lib/providers/pubmed/mapper';
import { searchTerm } from '@/lib/providers/pubmed/query';
import { pubmedSource } from '@/lib/providers/pubmed/source';
import { semanticScholarProvider } from '@/lib/providers/semanticscholar';
import { toS2Id } from '@/lib/providers/semanticscholar/ids';
import { toPaper as s2Paper } from '@/lib/providers/semanticscholar/mapper';
import { filterParams as s2Filters } from '@/lib/providers/semanticscholar/query';
import { s2Source } from '@/lib/providers/semanticscholar/source';

/* The scholarly paper sources added next to OpenAlex. Record fixtures are real
   answers from each service (trimmed). */

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'papers', name), 'utf8');

const NONE: PaperFilters = { yearFrom: null, yearTo: null, openAccess: false, types: [], language: null, hasAbstract: false, hideRetracted: false, minCitations: null };
const F = (over: Partial<PaperFilters>): PaperFilters => ({ ...NONE, ...over });

/* A transport that answers from `answer` and records each request. */
function fakeTransport(answer: (req: ScholarlyRequest) => unknown) {
  const calls: ScholarlyRequest[] = [];
  const t: ScholarlyTransport = {
    call: vi.fn(async (req: ScholarlyRequest) => {
      calls.push(req);
      const body = answer(req);
      if (body instanceof Error) throw body;
      return { body, costUsd: 0, status: 200 };
    }) as ScholarlyTransport['call'],
  };
  return { t, calls };
}

describe('shared scholarly pieces', () => {
  it('maps HTTP failures to provider errors', () => {
    const s = { provider: 'x', label: 'X' };
    expect(httpError(s, 429, 'slow', new Headers({ 'retry-after': '2' }))).toMatchObject({ code: 'busy', details: { status: 429, retryAfterS: 2 } });
    expect(httpError(s, 404, '', new Headers())).toMatchObject({ code: 'not_found' });
    expect(httpError(s, 400, 'bad query', new Headers())).toMatchObject({ code: 'bad_request', details: { reason: 'bad query' } });
    expect(httpError(s, 403, '', new Headers())).toMatchObject({ code: 'unavailable', details: { reason: 'auth' } });
    expect(httpError(s, 503, '', new Headers())).toMatchObject({ code: 'unavailable', details: { status: 503 } });
  });

  it('sends our name, hidden params and keys, and reads JSON or XML', async () => {
    const fetch = vi.fn(async () => new Response('{"ok":1}', { status: 200 }));
    const t = scholarlyTransport({ provider: 'x', label: 'X', baseUrl: 'https://x.org/api', timeoutMs: 1000, userAgent: 'UA', format: 'json', params: { api_key: 'k' }, headers: { 'x-api-key': 'h' }, fetch });
    await expect(t.call({ path: '/search', params: { q: 'a b', empty: '' } })).resolves.toEqual({ body: { ok: 1 }, costUsd: 0, status: 200 });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://x.org/api/search?q=a+b&api_key=k');
    expect(init.headers).toMatchObject({ 'user-agent': 'UA', 'x-api-key': 'h', accept: 'application/json' });
    const xml = scholarlyTransport({ provider: 'x', label: 'X', baseUrl: 'https://x.org', timeoutMs: 1000, userAgent: 'UA', format: 'xml', fetch: vi.fn(async () => new Response('<a/>')) });
    await expect(xml.call({ path: '/' })).resolves.toMatchObject({ body: '<a/>' });
    const broken = scholarlyTransport({ provider: 'x', label: 'X', baseUrl: 'https://x.org', timeoutMs: 1000, userAgent: 'UA', format: 'json', fetch: vi.fn(async () => new Response('<html>')) });
    await expect(broken.call({ path: '/' })).rejects.toMatchObject({ code: 'unavailable' });
    const down = scholarlyTransport({ provider: 'x', label: 'X', baseUrl: 'https://x.org', timeoutMs: 1000, userAgent: 'UA', format: 'json', fetch: vi.fn(async () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))) });
    await expect(down.call({ path: '/' })).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'timeout' } });
  });

  it('POSTs a JSON body when there is one', async () => {
    const fetch = vi.fn(async () => new Response('[]'));
    await scholarlyTransport({ provider: 'x', label: 'X', baseUrl: 'https://x.org', timeoutMs: 1000, userAgent: 'UA', format: 'json', fetch }).call({ path: '/batch', body: { ids: ['a'] } });
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init).toMatchObject({ method: 'POST', body: '{"ids":["a"]}' });
  });

  it('keys the cache by path, sorted params and body, with no readable text', () => {
    expect(requestKey({ path: '/s', params: { b: 2, a: 'x  y' } })).toBe(requestKey({ path: '/s', params: { a: 'x y', b: 2, c: '' } }));
    expect(requestKey({ path: '/s', body: { ids: [1] } })).not.toBe(requestKey({ path: '/s', body: { ids: [2] } }));
    expect(requestKey({ path: '/s', params: { q: 'crispr' } })).not.toContain('crispr');
  });

  it('gives each free source a shared rate, a breaker, older answers and one hiccup retry', () => {
    const basics = scholarlyBasics({});
    const p = scholarlyPolicy({ provider: 'x', label: 'X', basics, ratePerS: 0.3, concurrency: 1, isRecord: (r) => r.path === '/one' });
    expect(p).toMatchObject({ spend: null, concurrency: 1, rate: { perSecond: 0.3, maxWaitMs: 10_000 }, retryTransient: 1, staleS: 259_200, breaker: { failures: 5 } });
    expect(p.describe({ path: '/one' })).toMatchObject({ search: false, cacheTtlS: 604_800 });
    expect(p.describe({ path: '/list' })).toMatchObject({ cacheTtlS: 86_400 });
  });

  it('walks cursors to the page asked for, and stops at the cap', async () => {
    const pages: Record<string, { items: number[]; next: string | null }> = { start: { items: [1, 2], next: 'c2' }, c2: { items: [3, 4], next: 'c3' }, c3: { items: [5], next: null } };
    const fetchPage = vi.fn(async (c: string | null) => ({ ...pages[c ?? 'start'], total: 5 }));
    expect((await cursorPage(3, fetchPage)).items).toEqual([5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect((await cursorPage(4, fetchPage)).items).toEqual([]);
    expect((await cursorPage(9, fetchPage, 2)).items).toEqual([]);
  });

  it('cleans text and picks search words', () => {
    expect(plain('<h4>Background</h4>CRISPR &amp; <i>Cas9</i>  edits')).toBe('Background CRISPR & Cas9 edits');
    expect(searchWords('The effects of CRISPR off-target edits in the cells of mice, the cells!')).toEqual(['effects', 'crispr', 'off-target', 'edits', 'cells', 'mice']);
  });

  it('registers every source; only OpenAlex is on by default', () => {
    expect(Object.keys(PAPER_PROVIDERS).sort()).toEqual(['arxiv', 'clinicaltrials', 'europepmc', 'openalex', 'pubmed', 'semanticscholar']);
    const gate = ((t: unknown) => t) as never;
    expect(arxivProvider.create({}, gate)).not.toBeNull();
    expect(pubmedProvider.create({}, gate)).not.toBeNull();
    expect(clinicalTrialsProvider.create({}, gate)).not.toBeNull();
    expect(semanticScholarProvider.create({}, gate)).toBeNull(); // needs S2_API_KEY
    expect(semanticScholarProvider.create({ S2_API_KEY: 'k' }, gate)).not.toBeNull();
  });
});

describe('arXiv', () => {
  it('reads its identifiers', () => {
    expect(toArxivId('2101.00001v3')).toBe('2101.00001');
    expect(toArxivId('arXiv:2101.00001')).toBe('2101.00001');
    expect(toArxivId('https://arxiv.org/pdf/2101.00001v2.pdf')).toBe('2101.00001');
    expect(toArxivId('hep-th/9901001v1')).toBe('hep-th/9901001');
    expect(toArxivId('10.48550/arXiv.2101.00001')).toBe('2101.00001');
    expect(toArxivId('W123')).toBeNull();
  });

  it('turns text and filters into a search query, or rules arXiv out', () => {
    expect(arxivQuery('CRISPR off-target')).toBe('all:crispr AND all:"off-target"');
    expect(arxivQuery('gene editing in mice with base editors and prime editors', F({ yearFrom: 2020 }))).toBe(
      '(all:gene OR all:editing OR all:mice OR all:base OR all:editors OR all:prime) AND submittedDate:[202001010000 TO 999912312359]',
    );
    expect(arxivQuery('x y', F({ types: ['review'] }))).toBeNull();
    expect(arxivQuery('genes', F({ language: 'de' }))).toBeNull();
    expect(arxivQuery('genes', F({ minCitations: 10 }))).toBeNull();
    expect(arxivQuery('the of and')).toBeNull();
  });

  it('maps its Atom feed to papers', () => {
    const { papers, total } = fromFeed(fixture('arxiv-search.xml'));
    expect(total).toBe(29);
    expect(papers[0]).toMatchObject({
      id: 'arxiv:2202.07171',
      provider: 'arxiv',
      doi: '10.48550/arxiv.2202.07171',
      type: 'preprint',
      year: 2022,
      publicationDate: '2022-02-15',
      isOpenAccess: true,
      pdfUrl: 'https://arxiv.org/pdf/2202.07171v1',
      topics: ['q-bio.GN'],
      record: { label: 'arXiv', url: 'https://arxiv.org/abs/2202.07171' },
    });
    expect(papers[0].title).toMatch(/^Investigating the genomic background of CRISPR-Cas genomes/);
    expect(papers[0].authors.length).toBeGreaterThan(0);
    expect(papers[0].abstract?.length).toBeGreaterThan(50);
  });

  it('searches, pages and looks papers up through one call shape', async () => {
    const feed = fixture('arxiv-search.xml');
    const { t, calls } = fakeTransport(() => feed);
    const s = arxivSource(t);
    await s.search({ text: 'crispr protein', perPage: 10, page: 3, sort: 'newest' });
    expect(calls[0]).toEqual({ path: '/query', params: { search_query: 'all:crispr AND all:protein', start: 20, max_results: 10, sortBy: 'submittedDate', sortOrder: 'descending' } });
    await expect(s.search({ text: 'x', perPage: 10, filters: F({ types: ['book'] }) })).resolves.toEqual({ papers: [], total: 0, costUsd: 0 });
    expect(calls).toHaveLength(1); // ruled out without a call
    await s.getPaper({ kind: 'doi', doi: '10.1038/nature12373' });
    expect(calls).toHaveLength(1); // a journal DOI is not arXiv's
    const r = await s.getPapers!('doi', ['10.48550/ARXIV.2202.07171']);
    expect(calls[1].params).toMatchObject({ id_list: '2202.07171' });
    expect(r.found.get('10.48550/arxiv.2202.07171')?.id).toBe('arxiv:2202.07171');
  });
});

describe('PubMed', () => {
  it('reads PMIDs', () => {
    expect(toPmid('PMID: 36970624')).toBe('36970624');
    expect(toPmid('https://pubmed.ncbi.nlm.nih.gov/36970624/')).toBe('36970624');
    expect(toPmid('W123')).toBeNull();
  });

  it('builds search terms with its field tags', () => {
    expect(searchTerm('crispr off-target', F({ yearFrom: 2019, openAccess: true, language: 'en', hasAbstract: true, hideRetracted: true, types: ['review'] }))).toBe(
      '(crispr off-target) AND 2019:3000[dp] AND free full text[sb] AND english[la] AND hasabstract AND (review[pt]) NOT retracted publication[pt]',
    );
    expect(searchTerm('x y', F({ types: ['dissertation'] }))).toBeNull();
    expect(searchTerm('genes', F({ language: 'xx' }))).toBeNull();
  });

  it('maps an efetch record, with its own IDs (not its references’)', () => {
    const [p] = fromFetch(fixture('pubmed-fetch.xml'));
    expect(p).toMatchObject({
      id: 'pubmed:36970624',
      doi: '10.3389/fbioe.2023.1143157',
      title: 'Off-target effects in CRISPR/Cas9 gene editing.',
      type: 'review',
      language: 'en',
      year: 2023,
      isOpenAccess: true,
      isRetracted: false,
      record: { label: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/36970624/' },
    });
    expect(p.abstract).toMatch(/^Gene editing stands for/);
    expect(p.referenceIds.length).toBeGreaterThan(0);
    expect(p.referenceIds.every((id) => id.startsWith('pubmed:') && id !== 'pubmed:36970624')).toBe(true);
  });

  it('finds PMIDs, then fetches the records in that order', async () => {
    const xml = fixture('pubmed-fetch.xml');
    const { t: json, calls: jc } = fakeTransport(() => ({ esearchresult: { count: '42', idlist: ['36970624'] } }));
    const { t: x, calls: xc } = fakeTransport(() => xml);
    const s = pubmedSource(json, x);
    const page = await s.search({ text: 'crispr', perPage: 5, page: 2, sort: 'newest' });
    expect(jc[0].params).toMatchObject({ db: 'pubmed', term: '(crispr)', retstart: 5, retmax: 5, sort: 'pub_date', retmode: 'json' });
    expect(xc[0].params).toMatchObject({ id: '36970624', retmode: 'xml' });
    expect(page).toMatchObject({ total: 42, papers: [{ id: 'pubmed:36970624' }] });
    const byDoi = await s.getPapers!('doi', ['10.3389/FBIOE.2023.1143157']);
    expect(jc[1].params?.term).toBe('"10.3389/fbioe.2023.1143157"[doi]');
    expect(byDoi.found.get('10.3389/fbioe.2023.1143157')?.id).toBe('pubmed:36970624');
  });
});

describe('Europe PMC', () => {
  it('reads its identifiers', () => {
    expect(toEpmcId('MED:123')).toBe('MED:123');
    expect(toEpmcId('pmc1234567')).toBe('PMC:PMC1234567');
    expect(toEpmcId('https://europepmc.org/article/PPR/PPR123')).toBe('PPR:PPR123');
    expect(toEpmcId('42541388')).toBe('MED:42541388');
    expect(toEpmcId('XYZ:1')).toBeNull();
  });

  it('builds queries and sorts', () => {
    expect(epmcQuery('crispr off-target', F({ yearFrom: 2020, yearTo: 2024, openAccess: true, language: 'en', hasAbstract: true, types: ['preprint', 'review'], hideRetracted: true }))).toBe(
      '(crispr AND "off-target") AND PUB_YEAR:[2020 TO 2024] AND OPEN_ACCESS:y AND LANG:"eng" AND HAS_ABSTRACT:y AND (SRC:PPR OR PUB_TYPE:"review") NOT PUB_TYPE:"retracted publication"',
    );
    expect(epmcSort('cited')).toBe('CITED desc');
    expect(epmcQuery('x y', F({ types: ['dataset'] }))).toBeNull();
  });

  it('maps core results', () => {
    const [p] = epmcPapers(JSON.parse(fixture('europepmc-search.json')).resultList.result);
    expect(p).toMatchObject({
      id: 'europepmc:MED:42541388',
      doi: '10.1177/10430342261466427',
      year: 2026,
      publicationDate: '2026-08-01',
      source: 'Human gene therapy',
      type: 'article',
      language: 'en',
      isOpenAccess: false,
      record: { label: 'Europe PMC', url: 'https://europepmc.org/article/MED/42541388' },
    });
    expect(p.authors[0]).toEqual({ name: 'Blaha L', orcid: null });
    expect(p.topics).toContain('Gene therapy');
    expect(p.abstract).toMatch(/^Clustered Regularly Interspaced/);
  });

  it('pages with cursors and looks papers up by DOI', async () => {
    const answer = JSON.parse(fixture('europepmc-search.json'));
    const { t, calls } = fakeTransport((r) => ({ ...answer, nextCursorMark: r.params?.cursorMark === '*' ? 'c2' : 'c3' }));
    const s = epmcSource(t);
    await s.search({ text: 'crispr', perPage: 2, page: 2, sort: 'cited' });
    expect(calls.map((c) => c.params?.cursorMark)).toEqual(['*', 'c2']);
    expect(calls[1].params).toMatchObject({ query: '(crispr)', resultType: 'core', pageSize: 2, sort: 'CITED desc' });
    const r = await s.getPapers!('doi', ['10.1177/10430342261466427']);
    expect(calls[2].params?.query).toBe('(DOI:"10.1177/10430342261466427")');
    expect(r.found.get('10.1177/10430342261466427')?.id).toBe('europepmc:MED:42541388');
  });
});

describe('Semantic Scholar', () => {
  const RAW = {
    paperId: 'ABCDEF0123456789abcdef0123456789abcdef01',
    externalIds: { DOI: '10.1234/X', ArXiv: null },
    title: 'A <b>paper</b>',
    abstract: 'Words.',
    year: 2021,
    publicationDate: '2021-05-06',
    venue: 'NeurIPS',
    journal: null,
    authors: [{ name: 'Ada Lovelace' }],
    citationCount: 12,
    isOpenAccess: true,
    openAccessPdf: { url: 'https://x.org/p.pdf', license: 'CC-BY' },
    publicationTypes: ['Review'],
    fieldsOfStudy: ['Biology'],
  };

  it('reads its identifiers', () => {
    expect(toS2Id('https://www.semanticscholar.org/paper/Some-Title/ABCDEF0123456789abcdef0123456789abcdef01')).toBe('abcdef0123456789abcdef0123456789abcdef01');
    expect(toS2Id('CorpusID:123')).toBe('CorpusId:123');
    expect(toS2Id('123')).toBeNull();
  });

  it('maps papers and filters', () => {
    expect(s2Paper(RAW as never)).toMatchObject({
      id: 'semanticscholar:abcdef0123456789abcdef0123456789abcdef01',
      doi: '10.1234/x',
      title: 'A paper',
      source: 'NeurIPS',
      type: 'review',
      citedByCount: 12,
      pdfUrl: 'https://x.org/p.pdf',
      license: 'cc-by',
      topics: ['Biology'],
    });
    expect(s2Filters(F({ yearFrom: 2020, openAccess: true, minCitations: 5, types: ['review', 'article'] }))).toEqual({ year: '2020-', openAccessPdf: '', minCitationCount: 5, publicationTypes: 'Review,JournalArticle' });
    expect(s2Filters(F({ types: ['preprint'] }))).toBeNull();
  });

  it('searches, batches by POST and gives recommendations as "similar"', async () => {
    const { t, calls } = fakeTransport((r) => (r.body ? [RAW, null] : r.path.includes('recommendations') ? { recommendedPapers: [RAW] } : { total: 3000, data: [RAW] }));
    const s = s2Source(t);
    const page = await s.search({ text: 'the crispr screens', perPage: 25, page: 2 });
    expect(calls[0]).toMatchObject({ path: '/graph/v1/paper/search', params: { query: 'crispr screens', offset: 25, limit: 25 } });
    expect(page.total).toBe(1000);
    await expect(s.search({ text: 'x y', perPage: 25, page: 41 })).resolves.toMatchObject({ papers: [] });
    const r = await s.getPapers!('doi', ['10.1234/X', '10.5678/y']);
    expect(calls[1]).toMatchObject({ path: '/graph/v1/paper/batch', body: { ids: ['DOI:10.1234/x', 'DOI:10.5678/y'] } });
    expect([...r.found.keys()]).toEqual(['10.1234/x']);
    await expect(s.similar!('abcdef0123456789abcdef0123456789abcdef01', { filters: NONE, limit: 50 })).resolves.toMatchObject({ papers: [{ title: 'A paper' }] });
  });
});

describe('ClinicalTrials.gov', () => {
  it('reads trial IDs', () => {
    expect(toNctId('nct06783270')).toBe('NCT06783270');
    expect(toNctId('https://clinicaltrials.gov/study/NCT06783270?tab=results')).toBe('NCT06783270');
    expect(toNctId('NCT123')).toBeNull();
  });

  it('matches all of a few words, any of a longer passage', () => {
    expect(ctTerm('crispr sickle cell')).toBe('crispr sickle cell');
    expect(ctTerm('crispr off-target effects in sickle cell gene therapy')).toBe('crispr OR off-target OR effects OR sickle OR cell OR gene OR therapy');
  });

  it('filters by start date, and rules itself out for papers it cannot have', () => {
    expect(ctFilters(F({ yearFrom: 2020 }))).toEqual({ 'filter.advanced': 'AREA[StartDate]RANGE[2020-01-01,MAX]' });
    expect(ctFilters(F({ types: ['article'] }))).toBeNull();
    expect(ctFilters(F({ minCitations: 1 }))).toBeNull();
  });

  it('maps studies to papers with phase and status', () => {
    const papers = ctPapers(JSON.parse(fixture('clinicaltrials-search.json')).studies);
    expect(papers).toHaveLength(2);
    expect(papers[0]).toMatchObject({ provider: 'clinicaltrials', doi: null, type: 'other', isOpenAccess: true, language: 'en' });
    expect(papers[0].id).toMatch(/^clinicaltrials:NCT\d{8}$/);
    expect(papers[0].source).toMatch(/^ClinicalTrials\.gov/);
    expect(papers[0].record?.url).toMatch(/^https:\/\/clinicaltrials\.gov\/study\/NCT\d{8}$/);
  });

  it('pages with tokens and looks trials up in batches', async () => {
    const answer = JSON.parse(fixture('clinicaltrials-search.json'));
    const { t, calls } = fakeTransport((r) => ({ ...answer, nextPageToken: r.params?.pageToken ? 'tok3' : 'tok2' }));
    const s = ctSource(t);
    await s.search({ text: 'crispr', perPage: 2, page: 2, sort: 'newest' });
    expect(calls.map((c) => c.params?.pageToken)).toEqual([undefined, 'tok2']);
    expect(calls[0].params).toMatchObject({ 'query.term': 'crispr', sort: 'StartDate:desc', countTotal: 'true' });
    const nct = ctPapers(answer.studies)[0].id.split(':')[1];
    const r = await s.getPapers!('id', [nct]);
    expect(calls[2].params?.['filter.ids']).toBe(nct);
    expect(r.found.get(nct)?.id).toBe(`clinicaltrials:${nct}`);
    await expect(s.getPapers!('doi', ['10.1/x'])).resolves.toMatchObject({ found: new Map() });
  });
});
