import { describe, expect, it, vi } from 'vitest';
import { PapersError, toPapersError } from '@/lib/papers/errors';
import { similarTo } from '@/lib/papers/related/lists';
import { parseSearchRequest } from '@/lib/papers/search/request';
import { runSearch } from '@/lib/papers/search/run';
import { speakingPapersErrors } from '@/lib/papers/source';
import type { Paper } from '@/lib/papers/types';
import { lookupDois } from '@/lib/shelf/lookup/batch';
import { chooseProviders } from '@/lib/providers/config';
import { ProviderError } from '@/lib/providers/errors';
import { withBudget } from '@/lib/providers/gateway/budget';
import { withCache } from '@/lib/providers/gateway/cache';
import { memoryCache, memorySpend } from '@/lib/providers/gateway/store/memory';
import type { GatewayPolicy, Transport } from '@/lib/providers/gateway/types';
import { cloudinaryStore, parseCloudinaryUrl } from '@/lib/providers/cloudinary/store';
import { primaryPaperLimits } from '@/lib/providers/papers/limits';
import { PAPER_PROVIDERS } from '@/lib/providers/papers/registry';
import { paperSources } from '@/lib/providers/papers/sources';
import { supports, type PaperSource } from '@/lib/providers/papers/types';
import { PDF_TEXT_PROVIDERS } from '@/lib/providers/pdf-text/registry';
import { FILE_STORAGE_PROVIDERS } from '@/lib/providers/storage/registry';
import type { Gate } from '@/lib/providers/types';

const paper = (id: string, over: Partial<Paper> = {}): Paper => ({
  id,
  openalexId: id,
  doi: null,
  title: `Paper ${id}`,
  authors: [],
  year: null,
  publicationDate: null,
  source: null,
  type: null,
  language: null,
  abstract: null,
  citedByCount: 0,
  isOpenAccess: false,
  pdfUrl: null,
  landingUrl: null,
  isRetracted: false,
  topics: [],
  referencedWorkIds: [],
  ...over,
});

/* A minimal second paper provider: keyword search and single lookups only. */
function basicSource(name: string, found: Paper[]): PaperSource {
  return {
    name,
    limits: { maxQueryChars: 500, semanticMax: 20 },
    parseId: (raw) => raw,
    search: vi.fn(async () => ({ papers: found, total: found.length, costUsd: 0 })),
    getPaper: vi.fn(async (ref) => ({ paper: found.find((p) => (ref.kind === 'doi' ? p.doi === ref.doi : p.id === (ref as { id: string }).id)) ?? null, costUsd: 0 })),
  };
}

/* A provider that only searches by meaning. */
function meaningSource(found: Paper[]): PaperSource {
  return { ...basicSource('meaning', []), semanticSearch: vi.fn(async () => ({ papers: found, costUsd: 0.002 })) };
}

const req = (qs: string) => parseSearchRequest(new URLSearchParams(qs));

describe('choosing providers by configuration', () => {
  const registry = { a: 'A', b: 'B' };

  it('takes the configured names in order, primary first', () => {
    expect(chooseProviders(registry, 'b, a', ['a'], 'test')).toEqual(['B', 'A']);
  });

  it('falls back to the defaults, and skips unknown names with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(chooseProviders(registry, undefined, ['a'], 'test')).toEqual(['A']);
    expect(chooseProviders(registry, 'nope', ['a'], 'test')).toEqual(['A']);
    expect(chooseProviders(registry, 'nope,b,b', ['a'], 'test')).toEqual(['B']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'));
    warn.mockRestore();
  });

  it('registers today’s providers under each job', () => {
    expect(Object.keys(PAPER_PROVIDERS)).toEqual(['openalex']);
    expect(Object.keys(FILE_STORAGE_PROVIDERS)).toEqual(['cloudinary']);
    expect(Object.keys(PDF_TEXT_PROVIDERS)).toEqual(['basic']);
    expect(primaryPaperLimits({})).toEqual({ maxQueryChars: 1500, semanticMax: 50 });
  });

  it('builds file storage only when it is configured', () => {
    const gate: Gate = (t) => t;
    expect(FILE_STORAGE_PROVIDERS.cloudinary.create({}, gate)).toBeNull();
    expect(FILE_STORAGE_PROVIDERS.cloudinary.create({ CLOUDINARY_URL: 'cloudinary://k:s@demo' }, gate)?.name).toBe('cloudinary');
  });

  it('wires remote providers through the gate', () => {
    const gate = vi.fn((t) => t) as unknown as Gate;
    PAPER_PROVIDERS.openalex.create({}, gate);
    expect(gate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: 'openalex' }));
  });
});

describe('capabilities', () => {
  it('reports the optional capabilities a source has', () => {
    const openalex = PAPER_PROVIDERS.openalex.create({}, (t) => t)!;
    expect(['semantic_search', 'references', 'cited_by', 'batch_lookup'].every((c) => supports(openalex, c as never))).toBe(true);
    expect(supports(openalex, 'similar')).toBe(false);
    expect(supports(basicSource('x', []), 'semantic_search')).toBe(false);
  });

  it('finds sources by name and by capability, primary first', () => {
    const set = paperSources([basicSource('main', []), meaningSource([])]);
    expect(set.primary.name).toBe('main');
    expect(set.named('meaning')?.name).toBe('meaning');
    expect(set.named('nope')).toBeNull();
    expect(set.withCapability('semantic_search')?.name).toBe('meaning');
    expect(set.withCapability('references')).toBeNull();
    expect(() => paperSources([])).toThrow();
  });
});

describe('using more than one paper provider', () => {
  it('Smart mode takes keyword results from the primary and meaning results from another source', async () => {
    const set = paperSources([basicSource('main', [paper('A1'), paper('A2')]), meaningSource([paper('B1'), paper('A2')])]);
    const res = await runSearch(set, req('q=sleep'));
    expect(res.searches).toBe(2);
    expect(res.list.papers.map((p) => p.id)).toEqual(['A2', 'A1', 'B1']); // found by both ranks first
  });

  it('Smart mode falls back to keyword results when no source searches by meaning', async () => {
    const res = await runSearch(paperSources([basicSource('main', [paper('A1')])]), req('q=sleep'));
    expect(res).toMatchObject({ searches: 1, list: { mode: 'smart', papers: [{ id: 'A1' }] } });
  });

  it('search by meaning says plainly when no source offers it', async () => {
    await expect(runSearch(paperSources([basicSource('main', [])]), req('q=x&mode=semantic'))).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('"More like this" uses the source’s own similar list, else search by meaning, else says so', async () => {
    const r = parseSearchRequest(new URLSearchParams(), { requireQuery: false });
    const own = { ...basicSource('main', [paper('A1')]), similar: vi.fn(async () => ({ papers: [paper('A1'), paper('S1')], costUsd: 0 })) };
    expect((await similarTo(paperSources([own]), 'A1', r)).list.papers.map((p) => p.id)).toEqual(['S1']);

    const viaMeaning = paperSources([basicSource('main', [paper('A1')]), meaningSource([paper('M1')])]);
    expect((await similarTo(viaMeaning, 'A1', r)).list.papers.map((p) => p.id)).toEqual(['M1']);

    await expect(similarTo(paperSources([basicSource('main', [paper('A1')])]), 'A1', r)).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('looks DOIs up one by one when a source has no batch lookup', async () => {
    const src = basicSource('main', [paper('A1', { doi: '10.1/a' })]);
    const found = await lookupDois(src, ['10.1/A', '10.1/missing']);
    expect([...found.keys()]).toEqual(['10.1/a']);
    expect(src.getPaper).toHaveBeenCalledTimes(2);
  });
});

describe('one set of errors', () => {
  it('turns provider errors into Find Papers errors, keeping their details', () => {
    const e = toPapersError(new ProviderError('busy', 'slow down', { provider: 'openalex', retryAfterS: 2, status: 429 })) as PapersError;
    expect(e).toBeInstanceOf(PapersError);
    expect(e).toMatchObject({ code: 'busy', details: { retryAfterS: 2, status: 429 } });
    expect(e.details).not.toHaveProperty('provider');
    expect(toPapersError(new ProviderError('unsupported', 'Not here.'))).toMatchObject({ code: 'bad_request', message: 'Not here.' });
    const other = new Error('x');
    expect(toPapersError(other)).toBe(other);
  });

  it('paper sources used by features speak PapersError', async () => {
    const failing = { ...basicSource('main', []), search: async () => Promise.reject(new ProviderError('unavailable', 'down')) };
    await expect(speakingPapersErrors(failing).search({ text: 'x', perPage: 5 })).rejects.toBeInstanceOf(PapersError);
  });
});

describe('the gateway serves any provider', () => {
  type Req = { q: string };
  const policy = (provider: string, over: Partial<GatewayPolicy<Req>> = {}): GatewayPolicy<Req> => ({
    provider,
    label: provider,
    describe: (r) => ({ search: true, cacheKey: r.q, cacheTtlS: 60 }),
    spend: null,
    concurrency: 1,
    maxQueue: 1,
    retryTries: 1,
    ...over,
  });
  const transport = (body: string) => {
    const call = vi.fn(async () => ({ body, costUsd: 1, status: 200 }));
    return { t: { call } as unknown as Transport<Req>, call };
  };

  it('keeps each provider’s cache apart', async () => {
    const cache = memoryCache();
    const a = transport('from a');
    const b = transport('from b');
    await withCache(cache, policy('a'))(a.t).call({ q: 'same' });
    expect((await withCache(cache, policy('b'))(b.t).call({ q: 'same' })).body).toBe('from b');
    expect((await withCache(cache, policy('a'))(a.t).call({ q: 'same' })).body).toBe('from a');
    expect(a.call).toHaveBeenCalledTimes(1);
  });

  it('never caches calls the policy marks uncacheable', async () => {
    const { t, call } = transport('x');
    const layer = withCache(memoryCache(), policy('a', { describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }) }))(t);
    await layer.call({ q: '1' });
    await layer.call({ q: '1' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('caps each provider’s spending separately, and lets providers without limits through', async () => {
    const spend = memorySpend();
    const limits = { dailyAlertUsd: 1, dailyCapUsd: 1, configHint: 'X' };
    const capped = withBudget(spend, policy('a', { spend: limits }), () => {})(transport('x').t);
    await capped.call({ q: '1' });
    await expect(capped.call({ q: '2' })).rejects.toMatchObject({ code: 'budget', details: { provider: 'a' } });
    await expect(withBudget(spend, policy('b', { spend: limits }), () => {})(transport('x').t).call({ q: '1' })).resolves.toBeTruthy();
    const free = withBudget(spend, policy('c'), () => {})(transport('x').t);
    for (let i = 0; i < 3; i++) await free.call({ q: String(i) });
    expect(await spend.spent('c', new Date().toISOString().slice(0, 10))).toBe(0);
  });

  it('routes Cloudinary’s calls through the gate and reports failures in the common errors', async () => {
    const seen: string[] = [];
    const gate: Gate = (t, p) => {
      seen.push(p.provider);
      return t;
    };
    const fetch = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof globalThis.fetch;
    const store = cloudinaryStore(parseCloudinaryUrl('cloudinary://k:s@demo')!, { fetch, gate });
    expect(seen).toEqual(['cloudinary']);
    await expect(store.read('x', 10)).rejects.toMatchObject({ name: 'ProviderError', code: 'busy', details: { status: 429 } });
    const down = cloudinaryStore(parseCloudinaryUrl('cloudinary://k:s@demo')!, { fetch: vi.fn(async () => new Response('', { status: 500 })) as never });
    await expect(down.remove('x')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
