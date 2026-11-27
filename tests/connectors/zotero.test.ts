import { describe, expect, it } from 'vitest';
import { connectorTransport } from '@/lib/providers/connectors/http';
import { isConnectorAuthError } from '@/lib/providers/connectors/types';
import type { Gate } from '@/lib/providers/types';
import { zoteroConnector } from '@/lib/providers/zotero';
import { libraryPath } from '@/lib/providers/zotero/library';
import { cleanDoi, fromZotero, toZotero } from '@/lib/providers/zotero/map';

type Seen = { url: URL; method: string; headers: Record<string, string>; body: unknown };

function fakeZotero(answer: (s: Seen) => Response, env: Record<string, string> = {}) {
  const seen: Seen[] = [];
  const doFetch = (async (u: string, init: RequestInit) => {
    const s: Seen = { url: new URL(u), method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? (String(init.body).startsWith('[') || String(init.body).startsWith('{') ? JSON.parse(String(init.body)) : init.body) : undefined };
    seen.push(s);
    return answer(s);
  }) as unknown as typeof fetch;
  const gate: Gate = (_t, p) => connectorTransport({ provider: p.provider, label: p.label, fetch: doFetch }) as never;
  return { seen, connector: zoteroConnector.create(env, gate)! };
}

const cred = { accessToken: 'KEY123', account: { id: '42', label: 'ada' }, meta: { userId: 42 } };
const item = (key: string, data: Record<string, unknown>, parsedDate?: string) => ({ key, version: 7, data: { key, ...data }, meta: parsedDate ? { parsedDate } : {} });

describe('Zotero items', () => {
  it('reads a journal article', () => {
    const r = fromZotero(
      item(
        'AAAA1111',
        {
          itemType: 'journalArticle',
          title: 'Sleep and memory',
          creators: [{ creatorType: 'author', firstName: 'Ada', lastName: 'Lovelace' }, { creatorType: 'editor', lastName: 'Ed' }, { creatorType: 'author', name: 'WHO' }],
          publicationTitle: 'Nature',
          DOI: 'https://doi.org/10.1038/ABC.123.',
          url: 'https://nature.com/x',
          abstractNote: 'Abs',
          tags: [{ tag: 'sleep' }],
          collections: ['COL00001'],
          date: 'Spring 2019',
        },
        '2019',
      ),
    );
    expect(r).toEqual({ key: 'AAAA1111', version: 7, type: 'article', title: 'Sleep and memory', authors: ['Ada Lovelace', 'WHO'], year: 2019, source: 'Nature', doi: '10.1038/abc.123', url: 'https://nature.com/x', abstract: 'Abs', tags: ['sleep'], collections: ['COL00001'] });
  });

  it('finds a DOI kept in "extra", and names sources by kind', () => {
    const r = fromZotero(item('B', { itemType: 'book', title: 'A book', publisher: 'MIT Press', extra: 'tex.x: y\nDOI: 10.7551/mitpress/1.001.0001' }));
    expect(r).toMatchObject({ type: 'book', source: 'MIT Press', doi: '10.7551/mitpress/1.001.0001', url: null });
    expect(fromZotero(item('C', { itemType: 'thesis', title: 'T', university: 'Oxford' }))).toMatchObject({ type: 'dissertation', source: 'Oxford' });
    expect(fromZotero(item('D', { itemType: 'artwork', title: 'Art', url: 'javascript:x' }))).toMatchObject({ type: 'other', url: null });
    expect(cleanDoi('see doi:10.1000/xyz).')).toBe('10.1000/xyz');
  });

  it('writes references back with fields Zotero accepts for each kind', () => {
    expect(toZotero({ type: 'article', title: 'X', authors: ['Ada Lovelace', 'Curie, Marie', 'WHO'], year: 2020, source: 'Nature', doi: '10.1/x', url: null, abstract: null, tags: ['t'] }, 'COL00001')).toEqual({
      itemType: 'journalArticle',
      title: 'X',
      creators: [
        { creatorType: 'author', firstName: 'Ada', lastName: 'Lovelace' },
        { creatorType: 'author', firstName: 'Marie', lastName: 'Curie' },
        { creatorType: 'author', name: 'WHO' },
      ],
      date: '2020',
      url: '',
      abstractNote: '',
      tags: [{ tag: 't' }],
      collections: ['COL00001'],
      publicationTitle: 'Nature',
      DOI: '10.1/x',
    });
    const book = toZotero({ type: 'book', title: 'B', authors: [], year: null, source: 'MIT', doi: '10.2/b', url: null, abstract: null });
    expect(book).toMatchObject({ itemType: 'book', publisher: 'MIT', extra: 'DOI: 10.2/b' });
    expect(book.DOI).toBeUndefined();
  });

  it('only knows the user library and groups', () => {
    expect(libraryPath('user', 42)).toBe('/users/42');
    expect(libraryPath('group:123', 42)).toBe('/groups/123');
    expect(() => libraryPath('../keys', 42)).toThrow();
  });
});

describe('connecting Zotero', () => {
  it('a pasted key is the only way without the app keys; sign-in when they are set', () => {
    expect(fakeZotero(() => new Response()).connector.auth).toMatchObject({ signIn: null, apiKey: { type: 'api-key' } });
    expect(fakeZotero(() => new Response(), { ZOTERO_CLIENT_KEY: 'ck', ZOTERO_CLIENT_SECRET: 'cs' }).connector.auth.signIn?.type).toBe('oauth1');
  });

  it('checks a pasted key with Zotero', async () => {
    const z = fakeZotero((s) => (s.headers['zotero-api-key'] === 'GOOD' ? Response.json({ userID: 42, username: 'ada' }) : new Response('Invalid key', { status: 403 })));
    expect(await z.connector.auth.apiKey!.check('GOOD')).toEqual({ accessToken: 'GOOD', account: { id: '42', label: 'ada' }, meta: { userId: 42 } });
    expect(z.seen[0].url.toString()).toBe('https://api.zotero.org/keys/current');
    expect(z.seen[0].headers['zotero-api-version']).toBe('3');
    expect(isConnectorAuthError(await z.connector.auth.apiKey!.check('BAD').catch((e) => e))).toBe(true);
  });

  it('signs in with OAuth 1.0a: the access token secret is the API key', async () => {
    const z = fakeZotero(
      (s) =>
        s.url.pathname === '/oauth/request'
          ? new Response('oauth_token=RT&oauth_token_secret=RS&oauth_callback_confirmed=true')
          : new Response('oauth_token=AT&oauth_token_secret=THEKEY&userID=42&username=ada'),
      { ZOTERO_CLIENT_KEY: 'ck', ZOTERO_CLIENT_SECRET: 'cs' },
    );
    const signIn = z.connector.auth.signIn;
    if (signIn?.type !== 'oauth1') throw new Error('expected oauth1');
    const begun = await signIn.begin({ callbackUrl: 'https://cz.test/api/connectors/zotero/callback' });
    const auth = new URL(begun.authorizeUrl);
    expect(auth.host).toBe('www.zotero.org');
    expect(Object.fromEntries(auth.searchParams)).toMatchObject({ oauth_token: 'RT', library_access: '1', write_access: '1', all_groups: 'write' });
    expect(begun).toMatchObject({ token: 'RT', tokenSecret: 'RS' });
    expect(z.seen[0].headers.authorization).toMatch(/^OAuth .*oauth_callback="https%3A%2F%2Fcz\.test%2Fapi%2Fconnectors%2Fzotero%2Fcallback"/);
    const c = await signIn.finish({ token: 'RT', tokenSecret: 'RS', verifier: 'VER' });
    expect(c).toEqual({ accessToken: 'THEKEY', account: { id: '42', label: 'ada' }, meta: { userId: 42 } });
    expect(z.seen[1].headers.authorization).toContain('oauth_verifier="VER"');
    expect(z.seen[1].headers.authorization).toContain('oauth_token="RT"');
  });

  it('disconnecting deletes the key at Zotero', async () => {
    const z = fakeZotero(() => new Response(null, { status: 204 }));
    await z.connector.revoke!(cred);
    expect(z.seen[0]).toMatchObject({ method: 'DELETE' });
    expect(z.seen[0].url.pathname).toBe('/keys/KEY123');
  });
});

describe('a Zotero library', () => {
  it('lists the user library and the groups the key may see', async () => {
    const z = fakeZotero((s) =>
      s.url.pathname === '/keys/KEY123'
        ? Response.json({ access: { user: { library: true, write: true }, groups: { all: { library: true, write: false } } } })
        : Response.json([{ id: 9, data: { name: 'Lab' } }]),
    );
    expect(await z.connector.open(cred).references!.libraries()).toEqual([
      { id: 'user', name: 'My Library', kind: 'user', canWrite: true },
      { id: 'group:9', name: 'Lab', kind: 'group', canWrite: false },
    ]);
  });

  it('pages through items, leaving out notes, with total and library version from headers', async () => {
    const z = fakeZotero(() =>
      Response.json([item('A1111111', { itemType: 'journalArticle', title: 'One' }), item('N1111111', { itemType: 'note', note: 'x' })], { headers: { 'Total-Results': '230', 'Last-Modified-Version': '1234' } }),
    );
    const r = await z.connector.open(cred).references!.items('user', { collectionKey: 'COL00001', since: 1000, start: 100, limit: 100 });
    expect(r.items.map((i) => i.title)).toEqual(['One']);
    expect(r).toMatchObject({ total: 230, version: 1234 });
    const q = z.seen[0].url;
    expect(q.pathname).toBe('/users/42/collections/COL00001/items/top');
    expect(Object.fromEntries(q.searchParams)).toMatchObject({ since: '1000', start: '100', limit: '100', sort: 'dateModified', direction: 'asc' });
  });

  it('adds items 50 at a time with a write token, into a collection', async () => {
    const z = fakeZotero((s) => {
      const n = (s.body as unknown[]).length;
      return Response.json({ successful: Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [String(i), { key: `K${i}` }])), failed: { [String(n - 1)]: { code: 400, message: 'bad' } } });
    });
    const items = Array.from({ length: 120 }, (_, i) => ({ type: 'article', title: `P${i}`, authors: [], year: 2020, source: null, doi: null, url: null, abstract: null }));
    const r = await z.connector.open(cred).references!.addItems('group:9', items, { collectionKey: 'COL00001' });
    expect(r).toEqual({ added: 117, failed: 3 });
    expect(z.seen.map((s) => (s.body as unknown[]).length)).toEqual([50, 50, 20]);
    expect(z.seen[0].url.pathname).toBe('/groups/9/items');
    expect(z.seen[0].headers['zotero-write-token']).toMatch(/^[0-9a-f]{32}$/);
    expect((z.seen[0].body as { collections: string[] }[])[0].collections).toEqual(['COL00001']);
    await expect(z.connector.open(cred).references!.addItems('user', items.slice(0, 1), { collectionKey: 'bad key' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});
