import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_LABEL, compare, detectReferences, familyNames, parseEntry, titleScore, verdict, type RefEntry } from '@/lib/refcheck';
import { CHECK_CONCURRENCY, checkAll, checkOne } from '@/lib/refcheck-run';
import type { Source } from '@/lib/types';

const draft = (f: string) => readFileSync(`tests/fixtures/drafts/${f}.txt`, 'utf8');

describe('finding references in a draft', () => {
  it('APA: list entries, parenthetical and narrative citations, orphans and unused entries', () => {
    const d = detectReferences(draft('apa'));
    expect(d.entries).toHaveLength(6);
    const oke = d.entries.find((e) => e.title?.startsWith('The energetic basis'))!;
    expect(oke).toMatchObject({ year: 1982, authors: ['oke'], inList: true });
    expect(d.entries[0].doi).toBe('10.1016/j.landurbplan.2010.05.006');
    expect(d.intext.map((c) => c.raw)).toEqual(['Oke, 1982', 'Bowler et al., 2010', 'Santamouris & Kolokotsa, 2015', 'Stewart and Oke (2012)', 'Garcia, 2021', 'see Nobody, 2003']);
    expect(d.orphans.map((c) => c.raw)).toEqual(['see Nobody, 2003']);
    expect(d.uncited.map((e) => e.authorsShown[0])).toEqual(['Thompson']);
    // "in 1990" is not a citation
    expect(d.intext.some((c) => c.raw.includes('1990'))).toBe(false);
  });

  it('IEEE: numbered list, [n] markers, ranges and a marker with no entry', () => {
    const d = detectReferences(draft('ieee'));
    expect(d.entries.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.entries[0]).toMatchObject({ title: 'Deep learning', year: 2015, doi: '10.1038/nature14539', authorsShown: ['LeCun', 'Bengio', 'Hinton'] });
    expect(d.orphans.map((c) => c.raw)).toEqual(['[7]']);
    expect(d.uncited.map((e) => e.number)).toEqual([6]);
  });

  it('Vancouver: (n) markers, corporate authors and a bare DOI in the text', () => {
    const d = detectReferences(draft('vancouver'));
    expect(d.entries[0]).toMatchObject({ number: 1, year: 2000, title: 'Effectiveness of a hospital-wide programme to improve compliance with hand hygiene' });
    expect(d.entries[1].authorsShown).toEqual(['World Health Organization']);
    const bare = d.entries.find((e) => !e.inList)!;
    expect(bare.doi).toBe('10.1016/S0140-6736(00)02814-2');
    expect(d.intext.map((c) => c.raw)).toEqual(['(1)']);
    expect(d.uncited.map((e) => e.number)).toEqual([2]);
  });

  it('MLA: "Works Cited" with quoted titles', () => {
    const d = detectReferences(draft('mla'));
    expect(d.entries.map((e) => [e.title, e.year, e.authors[0]])).toEqual([
      ['The Well Wrought Urn: Studies in the Structure of Poetry', 1947, 'brooks'],
      ['The Limits of Critique', 2015, 'felski'],
    ]);
  });

  it('no reference list: only DOIs and author-year citations', () => {
    const d = detectReferences('Results improved (Smith, 2020). See https://doi.org/10.1000/xyz123.');
    expect(d.entries.map((e) => e.doi)).toEqual(['10.1000/xyz123']);
    expect(d.orphans.map((c) => c.raw)).toEqual(['Smith, 2020']);
    expect(d.listStart).toBe(-1);
  });

  it('reads names in the common forms', () => {
    expect(familyNames('Smith, J., & Lee, K.')).toEqual(['Smith', 'Lee']);
    expect(familyNames('J. Smith and K. Lee')).toEqual(['Smith', 'Lee']);
    expect(familyNames('Pittet D, Hugonnet S, et al')).toEqual(['Pittet', 'Hugonnet']);
    expect(familyNames('van der Berg, A.')).toEqual(['van der Berg']);
    expect(parseEntry('Garcia, M. (n.d.). A title with no date. Some Press.').title).toBe('A title with no date');
  });
});

const rec = (p: Partial<Source>): Source => ({ provider: 'Crossref', type: 'article', title: 'Deep learning', authors: [{ family: 'LeCun', given: 'Y.' }], year: 2015, ...p });
const entry = (p: Partial<RefEntry>): RefEntry => ({ id: 0, raw: '', start: 0, end: 0, inList: true, authors: ['lecun'], authorsShown: ['LeCun'], title: 'Deep learning', year: 2015, ...p });

describe('labelling', () => {
  it('Verified when title, first author and year all match', () => {
    expect(verdict(entry({}), { found: [rec({})], failed: false }).status).toBe('verified');
    expect(titleScore('Deep residual learning', 'Deep residual learning for image recognition')).toBeLessThan(0.92);
    expect(titleScore('Deep residual learning for image', 'Deep residual learning for image recognition')).toBe(0.92);
  });

  it('Partly matches says exactly what differs', () => {
    const v = verdict(entry({ year: 2020 }), { found: [rec({ year: 2019 })], failed: false });
    expect(v.status).toBe('partial');
    expect(v.diffs).toEqual(['year is 2019, not 2020']);
    const a = compare(entry({ authors: ['bengio'], authorsShown: ['Bengio'] }), rec({ authors: [{ family: 'LeCun' }, { family: 'Bengio' }] }), false);
    expect(a.diffs).toEqual(['Bengio is author 2, not the first (LeCun)']);
    const doiOther = verdict(entry({ doi: '10.1/x' }), { doiRecord: rec({ title: 'Something else entirely about cats' }), failed: false });
    expect(doiOther.status).toBe('partial');
    expect(doiOther.diffs[0]).toMatch(/DOI belongs to a different title/);
  });

  it('Not found only when every lookup answered; a failed lookup is “Could not check”', () => {
    expect(verdict(entry({}), { found: [rec({ title: 'Unrelated work on soil chemistry' })], failed: false }).status).toBe('notfound');
    expect(verdict(entry({}), { found: [], failed: true }).status).toBe('error');
    expect(STATUS_LABEL.notfound).toBe('Not found, possibly fake');
    expect(STATUS_LABEL.error).toBe('Could not check');
  });

  it('Retracted and Corrected come from the notices and OpenAlex flag', () => {
    expect(verdict(entry({}), { found: [rec({})], retracted: true, failed: false }).status).toBe('retracted');
    expect(verdict(entry({ doi: '10.1/x' }), { doiRecord: rec({}), notices: [{ kind: 'correction', label: 'Erratum notice' }], failed: false }).status).toBe('corrected');
    expect(verdict(entry({ doi: '10.1/x' }), { doiRecord: rec({}), notices: [{ kind: 'retraction', label: 'Retraction notice' }], failed: false }).status).toBe('retracted');
  });
});

/* A fake network: OpenAlex and Crossref answer from these tables. */
function fakeFetch(opts: { fail?: RegExp; delay?: number } = {}) {
  let inFlight = 0;
  let peak = 0;
  const calls: string[] = [];
  const crossrefWork = (doi: string) =>
    doi === '10.1038/nature14539'
      ? { DOI: doi, title: ['Deep learning'], author: [{ family: 'LeCun', given: 'Yann' }], issued: { 'date-parts': [[2015]] }, type: 'journal-article' }
      : doi === '10.1000/retracted'
        ? { DOI: doi, title: ['A retracted study of things'], author: [{ family: 'Fraud', given: 'A.' }], issued: { 'date-parts': [[2012]] }, type: 'journal-article', 'updated-by': [{ type: 'retraction', DOI: '10.1000/notice' }] }
        : null;
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, opts.delay ?? 1));
    inFlight--;
    if (opts.fail && opts.fail.test(url)) return new Response('busy', { status: 503 });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    let m = /api\.crossref\.org\/works\/([^?]+)/.exec(url);
    if (m) {
      const w = crossrefWork(decodeURIComponent(m[1]));
      return w ? json({ message: w }) : json({}, 404);
    }
    m = /api\.openalex\.org\/works\/doi:([^?]+)/.exec(url);
    if (m) {
      const doi = decodeURIComponent(m[1]);
      if (doi === '10.1000/retracted') return json({ id: 'W1', doi: `https://doi.org/${doi}`, display_name: 'A retracted study of things', publication_year: 2012, authorships: [{ author: { display_name: 'A. Fraud' } }], is_retracted: true });
      if (doi === '10.1038/nature14539') return json({ id: 'W2', doi: `https://doi.org/${doi}`, display_name: 'Deep learning', publication_year: 2015, authorships: [{ author: { display_name: 'Yann LeCun' } }], is_retracted: false });
      return json({}, 404);
    }
    if (/api\.crossref\.org\/works\?/.test(url)) {
      return json({ message: { items: /residual/.test(decodeURIComponent(url)) ? [{ DOI: '10.1109/cvpr.2016.90', title: ['Deep Residual Learning for Image Recognition'], author: [{ family: 'He', given: 'Kaiming' }], issued: { 'date-parts': [[2016]] }, type: 'proceedings-article' }] : [] } });
    }
    if (/api\.openalex\.org\/works\?/.test(url)) return json({ results: [] });
    if (/openlibrary\.org/.test(url)) return json({ docs: [] });
    return json({}, 404);
  });
  return { fn, calls, peak: () => peak };
}

afterEach(() => vi.unstubAllGlobals());

describe('looking references up (fake network)', () => {
  it('a DOI is checked directly in OpenAlex and Crossref', async () => {
    const f = fakeFetch();
    vi.stubGlobal('fetch', f.fn);
    const v = await checkOne(entry({ doi: '10.1038/nature14539' }), {});
    expect(v.status).toBe('verified');
    expect(f.calls.some((u) => u.includes('api.openalex.org/works/doi:10.1038'))).toBe(true);
    expect(f.calls.some((u) => u.includes('api.crossref.org/works/10.1038'))).toBe(true);
    // no searches when the DOI resolves
    expect(f.calls.some((u) => u.includes('query.bibliographic'))).toBe(false);
  });

  it('a retraction notice or OpenAlex flag marks it Retracted', async () => {
    vi.stubGlobal('fetch', fakeFetch().fn);
    const v = await checkOne(entry({ doi: '10.1000/retracted', title: 'A retracted study of things', authors: ['fraud'], authorsShown: ['Fraud'], year: 2012 }), {});
    expect(v.status).toBe('retracted');
    expect(v.notices.map((n) => n.kind)).toContain('retraction');
  });

  it('an unregistered DOI with no title is Not found', async () => {
    vi.stubGlobal('fetch', fakeFetch().fn);
    const v = await checkOne(entry({ doi: '10.9999/made.up', title: undefined, raw: '10.9999/made.up' }), {});
    expect(v.status).toBe('notfound');
    expect(v.note).toMatch(/isn’t registered/);
  });

  it('without a DOI it searches by title and first author', async () => {
    const f = fakeFetch();
    vi.stubGlobal('fetch', f.fn);
    const v = await checkOne(entry({ title: 'Deep residual learning for image recognition', authors: ['he'], authorsShown: ['He'], year: 2016, doi: undefined }), {});
    expect(v.status).toBe('verified');
    expect(decodeURIComponent(f.calls.find((u) => u.includes('query.bibliographic'))!)).toContain('Deep residual learning for image recognition He');
    const fake = await checkOne(entry({ title: 'A residual network that never existed', authors: ['smith'], authorsShown: ['Smith'], year: 2019, doi: undefined }), {});
    expect(fake.status).toBe('notfound');
  });

  it('a busy database is never reported as fake', async () => {
    vi.stubGlobal('fetch', fakeFetch({ fail: /crossref/ }).fn);
    const v = await checkOne(entry({ title: 'A residual network that never existed', authors: ['smith'], authorsShown: ['Smith'], doi: undefined }), {});
    expect(v.status).toBe('error');
    const d = await checkOne(entry({ doi: '10.9999/made.up', title: undefined }), {});
    expect(d.status).toBe('error');
  }, 20_000);

  it('keeps at most CHECK_CONCURRENCY requests in flight', async () => {
    const f = fakeFetch({ delay: 15 });
    vi.stubGlobal('fetch', f.fn);
    const entries = Array.from({ length: 12 }, (_, i) => entry({ id: i, doi: '10.1038/nature14539' }));
    const out = await checkAll(entries, {});
    expect(out.size).toBe(12);
    expect(CHECK_CONCURRENCY).toBe(5);
    expect(f.peak()).toBeLessThanOrEqual(5);
  });
});
