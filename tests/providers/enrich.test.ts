import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { enrichPapers } from '@/lib/papers/enrich';
import { coreEnricher, coreLookup } from '@/lib/providers/core';
import { crossrefEnricher, crossrefLookup, toPatch as crossrefPatch } from '@/lib/providers/crossref';
import { ProviderError } from '@/lib/providers/errors';
import { fillGaps, missing } from '@/lib/providers/enrich/fill';
import { ENRICH_PROVIDERS } from '@/lib/providers/enrich/registry';
import type { PaperEnricher } from '@/lib/providers/enrich/types';
import { withDailyCalls } from '@/lib/providers/gateway/calls';
import { memorySpend } from '@/lib/providers/gateway/store/memory';
import type { GatewayPolicy, Transport } from '@/lib/providers/gateway/types';
import type { ScholarlyRequest, ScholarlyTransport } from '@/lib/providers/papers/http';
import { semanticScholarEnricher } from '@/lib/providers/semanticscholar';
import { s2Lookup } from '@/lib/providers/semanticscholar/enrich';
import { toPatch as unpaywallPatch, unpaywallEnricher, unpaywallLookup } from '@/lib/providers/unpaywall';
import { paper } from '../shelf/fixtures';

/* Filling in paper details: the gap-filling rule, each filler's mapping (real
   answers as fixtures), the order they are asked in, and Unpaywall's daily cap. */

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'papers', name), 'utf8'));

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

describe('filling gaps', () => {
  it('fills only what is missing, never overwriting', () => {
    const p = paper('W1', { abstract: null, pdfUrl: null, isOpenAccess: false, citedByCount: 0, license: null });
    const r = fillGaps(p, { abstract: 'New.', pdfUrl: 'https://x.org/a.pdf', isOpenAccess: true, citedByCount: 4, title: 'Other title', license: 'cc-by' });
    expect(r.paper).toMatchObject({ abstract: 'New.', pdfUrl: 'https://x.org/a.pdf', isOpenAccess: true, citedByCount: 4, title: 'Paper W1', license: 'cc-by' });
    expect(r.changed.sort()).toEqual(['abstract', 'citedByCount', 'isOpenAccess', 'license', 'pdfUrl']);
  });

  it('open access and retractions only move one way', () => {
    const p = paper('W1', { isOpenAccess: true, isRetracted: false });
    expect(fillGaps(p, { isOpenAccess: false, isRetracted: true }).paper).toMatchObject({ isOpenAccess: true, isRetracted: true });
    expect(missing(paper('W2', { title: 'Untitled' }), 'title')).toBe(true);
  });
});

describe('Unpaywall', () => {
  it('maps the best free copy', () => {
    expect(unpaywallPatch(fixture('unpaywall.json'))).toEqual({ isOpenAccess: true, pdfUrl: 'https://www.frontiersin.org/articles/10.3389/fbioe.2023.1143157/pdf', license: 'cc-by' });
  });

  it('asks one DOI per call and skips DOIs it does not know', async () => {
    const { t, calls } = fakeTransport((r) => (r.path.includes('unknown') ? new ProviderError('not_found', 'x', { status: 404 }) : fixture('unpaywall.json')));
    const r = await unpaywallLookup(t)(['https://doi.org/10.3389/FBIOE.2023.1143157', '10.9999/unknown', 'not a doi']);
    expect(calls.map((c) => c.path)).toEqual(['/v2/10.3389%2Ffbioe.2023.1143157', '/v2/10.9999%2Funknown']);
    expect([...r.keys()]).toEqual(['10.3389/fbioe.2023.1143157']);
  });

  it('needs our contact email, and caps its calls a day', () => {
    const gate = ((t: unknown, policy: GatewayPolicy<unknown>) => Object.assign(t as object, { policy })) as never;
    expect(unpaywallEnricher.create({}, gate)).toBeNull();
    const e = unpaywallEnricher.create({ PROVIDER_CONTACT_EMAIL: 'team@example.org', UNPAYWALL_DAILY_CALLS: '500000' }, gate);
    expect(e?.fills).toEqual(['isOpenAccess', 'pdfUrl', 'license']);
  });
});

describe('Crossref', () => {
  it('maps the publisher record: abstract, authors, date, license, citations', () => {
    const [frontiers, nature] = fixture('crossref-works.json').message.items;
    expect(crossrefPatch(frontiers)).toMatchObject({
      title: 'Off-target effects in CRISPR/Cas9 gene editing',
      year: 2023,
      publicationDate: '2023-03-09',
      source: 'Frontiers in Bioengineering and Biotechnology',
      type: 'article',
      license: 'cc-by',
      isOpenAccess: true,
      isRetracted: false,
    });
    expect(crossrefPatch(frontiers).abstract).toMatch(/^Gene editing stands for/);
    expect(crossrefPatch(frontiers).authors?.[0]).toEqual({ name: 'Congting Guo', orcid: null });
    // a publisher's text-mining license is not an open one, and its PDF link is not used
    expect(crossrefPatch(nature)).toMatchObject({ license: null, isOpenAccess: false });
    expect(crossrefPatch(nature)).not.toHaveProperty('pdfUrl');
  });

  it('reads retraction notices', () => {
    expect(crossrefPatch({ DOI: '10.1/x', 'updated-by': [{ type: 'retraction' }] }).isRetracted).toBe(true);
  });

  it('looks DOIs up in batches with one filter', async () => {
    const answer = fixture('crossref-works.json');
    const { t, calls } = fakeTransport(() => answer);
    const r = await crossrefLookup(t)(['10.3389/fbioe.2023.1143157', '10.1038/NATURE24268']);
    expect(calls[0].params).toMatchObject({ filter: 'doi:10.3389/fbioe.2023.1143157,doi:10.1038/nature24268', rows: 2 });
    expect([...r.keys()].sort()).toEqual(['10.1038/nature24268', '10.3389/fbioe.2023.1143157']);
  });

  it('is in the polite pool only with our contact email', () => {
    const seen: GatewayPolicy<unknown>[] = [];
    const gate = ((t: unknown, policy: GatewayPolicy<unknown>) => (seen.push(policy), t)) as never;
    crossrefEnricher.create({}, gate);
    crossrefEnricher.create({ PROVIDER_CONTACT_EMAIL: 'team@example.org' }, gate);
    expect(seen.map((p) => p.rate?.perSecond)).toEqual([0.9, 2.5]);
  });
});

describe('CORE and Semantic Scholar', () => {
  it('CORE gives a free full-text link; it needs a key', async () => {
    const { t, calls } = fakeTransport((r) => ((r.body as { doi: string }).doi === '10.1/none' ? { fullTextLink: null } : { fullTextLink: 'https://core.ac.uk/download/1.pdf' }));
    const r = await coreLookup(t)(['10.1234/a', '10.1/none']);
    expect(calls[0]).toMatchObject({ path: '/v3/discover', body: { doi: '10.1234/a' } });
    expect(r.get('10.1234/a')).toEqual({ pdfUrl: 'https://core.ac.uk/download/1.pdf', isOpenAccess: true });
    expect(r.has('10.1/none')).toBe(false);
    expect(coreEnricher.create({}, ((x: unknown) => x) as never)).toBeNull();
  });

  it('Semantic Scholar fills abstracts and PDFs for many DOIs in one call', async () => {
    const { t, calls } = fakeTransport(() => [{ abstract: 'Text.', citationCount: 3, isOpenAccess: true, openAccessPdf: { url: 'https://x.org/p.pdf', license: 'CC-BY' } }, null]);
    const r = await s2Lookup(t)(['10.1234/a', '10.5678/b']);
    expect(calls[0].body).toEqual({ ids: ['DOI:10.1234/a', 'DOI:10.5678/b'] });
    expect(r.get('10.1234/a')).toEqual({ abstract: 'Text.', citedByCount: 3, isOpenAccess: true, pdfUrl: 'https://x.org/p.pdf', license: 'cc-by' });
    expect(r.has('10.5678/b')).toBe(false);
    expect(semanticScholarEnricher.create({}, ((x: unknown) => x) as never)).toBeNull();
  });

  it('registers the fillers; none is on by default', () => {
    expect(Object.keys(ENRICH_PROVIDERS)).toEqual(['unpaywall', 'crossref', 'core', 'semanticscholar']);
  });
});

describe('asking fillers in order', () => {
  const enricher = (name: string, fills: PaperEnricher['fills'], patch: Record<string, unknown>, fail = false): PaperEnricher & { asked: string[][] } => {
    const asked: string[][] = [];
    return {
      name,
      fills,
      asked,
      async lookup(dois) {
        asked.push(dois);
        if (fail) throw new Error('down');
        return new Map(dois.map((d) => [d, patch]));
      },
    };
  };

  it('later fillers are only asked about papers still missing something they fill', async () => {
    const papers = [paper('W1', { pdfUrl: null, abstract: null }), paper('W2', { pdfUrl: 'https://has.pdf', abstract: 'Has one.' }), paper('W3', { doi: null, pdfUrl: null })];
    const unpaywall = enricher('unpaywall', ['pdfUrl', 'isOpenAccess'], { pdfUrl: 'https://free.pdf' });
    const crossref = enricher('crossref', ['abstract', 'pdfUrl'], { abstract: 'From Crossref.', pdfUrl: 'https://ignored.pdf' });
    const r = await enrichPapers(papers, [unpaywall, crossref]);
    expect(unpaywall.asked).toEqual([['10.1000/w1']]); // W2 has a PDF, W3 has no DOI
    expect(crossref.asked).toEqual([['10.1000/w1']]);
    expect(r.papers[0]).toMatchObject({ pdfUrl: 'https://free.pdf', abstract: 'From Crossref.' });
    expect(r.papers[1]).toEqual(papers[1]);
    expect([...r.changed]).toEqual(['openalex:W1']);
    expect(r.byEnricher).toEqual({ unpaywall: 1, crossref: 1 });
  });

  it('a filler only sets the fields it is meant to, and one failing leaves the rest working', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const down = enricher('core', ['pdfUrl'], {}, true);
    const sneaky = enricher('crossref', ['abstract'], { abstract: 'A.', pdfUrl: 'https://not.allowed' });
    const r = await enrichPapers([paper('W1', { abstract: null, pdfUrl: null })], [down, sneaky]);
    expect(r.papers[0]).toMatchObject({ abstract: 'A.', pdfUrl: null });
    warn.mockRestore();
  });
});

describe('daily call cap', () => {
  it('counts each call and refuses past the cap until the next UTC day', async () => {
    let now = Date.UTC(2026, 10, 23, 10);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memorySpend();
    const call = vi.fn(async () => ({ body: {}, costUsd: 0, status: 200 }));
    const policy = { provider: 'unpaywall', label: 'Unpaywall', describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }), dailyCalls: { cap: 2, configHint: 'UNPAYWALL_DAILY_CALLS' } };
    const t = withDailyCalls(store, policy, () => now)({ call } as unknown as Transport<unknown>);
    await t.call({});
    await t.call({});
    await expect(t.call({})).rejects.toMatchObject({ code: 'budget', details: { reason: 'daily_calls' } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    now += 86_400_000;
    await expect(t.call({})).resolves.toMatchObject({ status: 200 });
    warn.mockRestore();
  });
});
