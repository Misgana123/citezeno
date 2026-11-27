import { describe, expect, it, vi } from 'vitest';
import { createTavily, tavilyPolicy, toWebResults } from '@/lib/providers/tavily/search';
import { WEB_SEARCH_PROVIDERS } from '@/lib/providers/web-search/registry';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;
const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('web search (Tavily)', () => {
  it('is registered under its job, and is off without a key', () => {
    expect(Object.keys(WEB_SEARCH_PROVIDERS)).toEqual(['tavily']);
    expect(createTavily({}, ungated)).toBeNull();
    expect(createTavily({ TAVILY_API_KEY: '  ' }, ungated)).toBeNull();
  });

  it('sends a basic search with the key in a header and reads the results', async () => {
    const fetch = answer({ results: [{ title: 'WHO sleep', url: 'https://who.int/sleep', content: '  Adults need\n 7 hours ', published_date: 'Tue, 04 Nov 2025 10:00:00 GMT' }] });
    const web = createTavily({ TAVILY_API_KEY: 'tvly-key' }, ungated, fetch)!;
    const results = await web.search('sleep hours adults', { maxResults: 3, topic: 'news', days: 7 });
    expect(results).toEqual([{ title: 'WHO sleep', url: 'https://who.int/sleep', snippet: 'Adults need 7 hours', published: '2025-11-04' }]);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tvly-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'sleep hours adults', max_results: 3, search_depth: 'basic', topic: 'news', days: 7, include_raw_content: false });
    expect(init.body).not.toContain('tvly-key');
  });

  it('only limits by age for news', async () => {
    const fetch = answer({ results: [] });
    await createTavily({ TAVILY_API_KEY: 'k' }, ungated, fetch)!.search('x', { maxResults: 5, days: 7 });
    expect(JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string)).not.toHaveProperty('days');
  });

  it('drops results without a web address', () => {
    expect(
      toWebResults({
        results: [
          { title: 'x', url: 'javascript:alert(1)' },
          { url: 'https://a.example', content: 'c' },
        ],
      }),
    ).toEqual([{ title: 'https://a.example', url: 'https://a.example', snippet: 'c', published: null }]);
  });

  it('turns failures into the common errors', async () => {
    const make = (status: number) => createTavily({ TAVILY_API_KEY: 'k' }, ungated, answer({ detail: { error: 'nope' } }, status))!;
    await expect(make(401).search('x', { maxResults: 1 })).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'auth' } });
    await expect(make(429).search('x', { maxResults: 1 })).rejects.toMatchObject({ code: 'busy' });
    await expect(make(432).search('x', { maxResults: 1 })).rejects.toMatchObject({ code: 'budget' });
    await expect(make(500).search('x', { maxResults: 1 })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('is priced per search, capped daily, cached, and never counted as a paper search', () => {
    const p = tavilyPolicy({ WEB_DAILY_CAP_USD: '3' });
    const info = p.describe({ apiKey: 'k', body: { query: 'a' }, usd: 0.008 });
    expect(info.search).toBe(false);
    expect(info.cacheKey).toMatch(/^[a-f0-9]{64}$/);
    expect(info.cacheKey).toBe(p.describe({ apiKey: 'other', body: { query: 'a' }, usd: 0.008 }).cacheKey);
    expect(p.spend).toMatchObject({ dailyCapUsd: 3, dailyAlertUsd: 2 });
  });
});
