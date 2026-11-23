import { describe, expect, it, vi } from 'vitest';
import { papersConfig } from '@/lib/papers/config';
import { ProviderError } from '@/lib/providers/errors';
import { sharedProviderConfig } from '@/lib/providers/shared';
import { buildUrl, createOpenAlexTransport, readCost, type QueryParams } from '@/lib/providers/openalex/client';
import { openAlexConfig } from '@/lib/providers/openalex/config';

/* The raw OpenAlex transport, called the way the gateway calls it. */
const createOpenAlexClient = (deps: Parameters<typeof createOpenAlexTransport>[0]) => {
  const t = createOpenAlexTransport(deps);
  return { get: (path: string, params?: QueryParams) => t.call({ path, params }) };
};

const CONFIG = { apiKey: 'secret-key', baseUrl: 'https://api.example.org', timeoutMs: 1000 };

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }));
}

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error('expected a failure');
}

describe('openAlexConfig', () => {
  it('uses defaults', () => {
    expect(openAlexConfig({})).toEqual({
      apiKey: null,
      baseUrl: 'https://api.openalex.org',
      timeoutMs: 10_000,
      maxQueryChars: 1500,
      dailyAlertUsd: 0.8,
      dailyCapUsd: 2,
      cacheSearchS: 86_400,
      cachePaperS: 604_800,
      ratePerS: 10,
      maxWaitMs: 10_000,
      userAgent: 'Citezeno/1.0 (+https://citezeno.com)',
    });
  });

  it('reads the environment and ignores bad values', () => {
    const c = openAlexConfig({ OPENALEX_API_KEY: ' k ', OPENALEX_BASE_URL: 'https://x.org/', PAPERS_DAILY_CAP_USD: '-1' });
    expect(c.apiKey).toBe('k');
    expect(c.baseUrl).toBe('https://x.org');
    expect(c.dailyCapUsd).toBe(2);
  });

  it('keeps the search length within what OpenAlex allows', () => {
    expect(openAlexConfig({ OPENALEX_MAX_QUERY_CHARS: '2000' }).maxQueryChars).toBe(2000);
    expect(openAlexConfig({ OPENALEX_MAX_QUERY_CHARS: '5000' }).maxQueryChars).toBe(2000);
    expect(openAlexConfig({ OPENALEX_MAX_QUERY_CHARS: '10' }).maxQueryChars).toBe(100);
  });
});

describe('papersConfig', () => {
  it('uses defaults, and the search length of the primary paper provider', () => {
    expect(papersConfig({})).toEqual({ maxQueryChars: 1500, dailySearchesPerUser: 100 });
    expect(papersConfig({ OPENALEX_MAX_QUERY_CHARS: '2000', PAPERS_DAILY_SEARCHES: '25.7' })).toEqual({ maxQueryChars: 2000, dailySearchesPerUser: 25 });
  });
});

describe('OpenAlex client', () => {
  it('builds URLs, skipping empty params', () => {
    expect(buildUrl('https://a.org', '/works', { search: 'gene therapy', page: 2, filter: '', x: null }).toString()).toBe(
      'https://a.org/works?search=gene+therapy&page=2',
    );
  });

  it('sends the key as a header, never in the URL', async () => {
    const fetch = respond(200, { meta: { cost_usd: 0.001 }, results: [] });
    const client = createOpenAlexClient({ config: CONFIG, fetch });
    const res = await client.get('/works', { search: 'x' });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).not.toContain('secret-key');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
    expect(res).toEqual({ body: { meta: { cost_usd: 0.001 }, results: [] }, costUsd: 0.001, status: 200 });
  });

  it('omits the header without a key', async () => {
    const fetch = respond(200, { results: [] });
    await createOpenAlexClient({ config: { ...CONFIG, apiKey: null }, fetch }).get('/works');
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('says who we are, with the contact email when one is set', async () => {
    const fetch = respond(200, { results: [] });
    const { userAgent } = sharedProviderConfig({ PROVIDER_CONTACT_EMAIL: 'team@example.org' });
    await createOpenAlexClient({ config: { ...CONFIG, userAgent }, fetch }).get('/works');
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>)['user-agent']).toBe('Citezeno/1.0 (+https://citezeno.com; mailto:team@example.org)');
    expect(sharedProviderConfig({ PROVIDER_CONTACT_EMAIL: 'not an email' }).userAgent).toBe('Citezeno/1.0 (+https://citezeno.com)');
  });

  it('reads cost from meta, then from the header', () => {
    expect(readCost({ meta: { cost_usd: 0.002 } }, new Headers())).toBe(0.002);
    expect(readCost({}, new Headers({ 'x-ratelimit-cost-usd': '0.0001' }))).toBe(0.0001);
    expect(readCost(null, new Headers())).toBe(0);
  });

  it('maps a per-second 429 to busy with Retry-After', async () => {
    const client = createOpenAlexClient({ config: CONFIG, fetch: respond(429, { reason: 'semantic_search' }, { 'retry-after': '1' }) });
    const e = await failure(client.get('/works'));
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.code).toBe('busy');
    expect(e.details).toMatchObject({ retryAfterS: 1, reason: 'semantic_search', status: 429 });
  });

  it('maps a spent daily budget to budget', async () => {
    const e = await failure(createOpenAlexClient({ config: CONFIG, fetch: respond(429, { reason: 'daily_budget' }) }).get('/works'));
    expect(e.code).toBe('budget');
  });

  it('maps 404, 400 and 5xx', async () => {
    expect((await failure(createOpenAlexClient({ config: CONFIG, fetch: respond(404, {}) }).get('/works/W1'))).code).toBe('not_found');
    const bad = await failure(createOpenAlexClient({ config: CONFIG, fetch: respond(400, { message: 'bad filter' }) }).get('/works'));
    expect(bad.code).toBe('bad_request');
    expect(bad.message).toMatch(/could not be run/);
    expect(bad.details.reason).toBe('bad filter'); // OpenAlex's wording is kept for debugging, not shown
    expect((await failure(createOpenAlexClient({ config: CONFIG, fetch: respond(503, 'down') }).get('/works'))).code).toBe('unavailable');
  });

  it('maps network errors, timeouts and unreadable bodies to unavailable', async () => {
    const net = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await failure(createOpenAlexClient({ config: CONFIG, fetch: net }).get('/works'))).details.reason).toBe('network');
    const slow = vi.fn(async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    });
    expect((await failure(createOpenAlexClient({ config: CONFIG, fetch: slow }).get('/works'))).details.reason).toBe('timeout');
    expect((await failure(createOpenAlexClient({ config: CONFIG, fetch: respond(200, 'not json') }).get('/works'))).code).toBe('unavailable');
  });
});
