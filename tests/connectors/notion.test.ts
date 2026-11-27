import { describe, expect, it } from 'vitest';
import { connectorTransport } from '@/lib/providers/connectors/http';
import { notionConnector } from '@/lib/providers/notion';
import { blockToMarkdown, richText, toNotionBlocks } from '@/lib/providers/notion/blocks';
import { notionId, propertyValue } from '@/lib/providers/notion/pages';
import type { Gate } from '@/lib/providers/types';

type Seen = { url: URL; method: string; headers: Record<string, string>; body: unknown };

function fakeNotion(answer: (s: Seen) => Response) {
  const seen: Seen[] = [];
  const doFetch = (async (u: string, init: RequestInit) => {
    const s: Seen = { url: new URL(u), method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    return answer(s);
  }) as unknown as typeof fetch;
  const gate: Gate = (_t, p) => connectorTransport({ provider: p.provider, label: p.label, fetch: doFetch }) as never;
  return { seen, connector: notionConnector.create({ NOTION_CLIENT_ID: 'cid', NOTION_CLIENT_SECRET: 'sec' }, gate)! };
}

const ID = '1234567890abcdef1234567890abcdef';
const DASHED = '12345678-90ab-cdef-1234-567890abcdef';
const cred = { accessToken: 'secret_tok', account: { id: 'b', label: 'W' } };

describe('Notion text and blocks', () => {
  it('reads inline marks into rich text', () => {
    expect(richText('a **b** *c* `d` [e](https://x.org) f')).toEqual([
      { type: 'text', text: { content: 'a ', link: null } },
      { type: 'text', text: { content: 'b', link: null }, annotations: { bold: true } },
      { type: 'text', text: { content: ' ', link: null } },
      { type: 'text', text: { content: 'c', link: null }, annotations: { italic: true } },
      { type: 'text', text: { content: ' ', link: null } },
      { type: 'text', text: { content: 'd', link: null }, annotations: { code: true } },
      { type: 'text', text: { content: ' ', link: null } },
      { type: 'text', text: { content: 'e', link: { url: 'https://x.org' } } },
      { type: 'text', text: { content: ' f', link: null } },
    ]);
    expect(richText('2 * 3 = 6')).toEqual([{ type: 'text', text: { content: '2 * 3 = 6', link: null } }]);
  });

  it('splits long text into 2,000-character pieces', () => {
    const r = richText('x'.repeat(4500));
    expect(r.map((p) => p.text.content.length)).toEqual([2000, 2000, 500]);
  });

  it('makes Notion blocks, tables with a header row', () => {
    const b = toNotionBlocks([
      { type: 'heading', level: 2, text: 'Results' },
      { type: 'bullets', items: ['one', 'two'] },
      { type: 'table', headers: ['A', 'B'], rows: [['1']] },
      { type: 'divider' },
    ]);
    expect(b.map((x) => x.type)).toEqual(['heading_2', 'bulleted_list_item', 'bulleted_list_item', 'table', 'divider']);
    const table = b[3].table as { table_width: number; children: { table_row: { cells: unknown[][] } }[] };
    expect(table.table_width).toBe(2);
    expect(table.children).toHaveLength(2);
    expect(table.children[1].table_row.cells[1]).toEqual([]);
  });

  it('reads Notion blocks back as markdown', () => {
    const rt = [{ plain_text: 'Hi', annotations: { bold: true } }, { plain_text: ' there', href: 'https://x.org' }];
    expect(blockToMarkdown({ type: 'heading_1', heading_1: { rich_text: rt } }, 0)).toBe('# **Hi**[ there](https://x.org)');
    expect(blockToMarkdown({ type: 'numbered_list_item', numbered_list_item: { rich_text: [{ plain_text: 'x' }] } }, 3)).toBe('3. x');
    expect(blockToMarkdown({ type: 'to_do', to_do: { rich_text: [{ plain_text: 'y' }], checked: true } }, 0)).toBe('- [x] y');
    expect(blockToMarkdown({ type: 'child_page', child_page: { title: 'Sub' } }, 0)).toContain('[Sub]');
  });

  it('accepts IDs with or without dashes, or in a link', () => {
    expect(notionId(ID)).toBe(DASHED);
    expect(notionId(DASHED)).toBe(DASHED);
    expect(notionId(`https://www.notion.so/My-page-${ID}?pvs=4`)).toBe(DASHED);
    expect(() => notionId('nope')).toThrow();
  });

  it('fills database columns by type', () => {
    expect(propertyValue('title', 'A paper')).toEqual({ title: [{ type: 'text', text: { content: 'A paper', link: null } }] });
    expect(propertyValue('number', '2021')).toEqual({ number: 2021 });
    expect(propertyValue('number', 'n/a')).toBeUndefined();
    expect(propertyValue('date', 2021)).toEqual({ date: { start: '2021-01-01' } });
    expect(propertyValue('url', 'javascript:alert(1)')).toBeUndefined();
    expect(propertyValue('multi_select', ['a,b', 'c', 'c'])).toEqual({ multi_select: [{ name: 'a b' }, { name: 'c' }] });
    expect(propertyValue('rich_text', null)).toBeUndefined();
    expect(propertyValue('people', 'x')).toBeUndefined();
  });
});

describe('Notion connector', () => {
  it('signs in with the client in Basic auth, and names the workspace', async () => {
    const n = fakeNotion(() => Response.json({ access_token: 'secret_x', bot_id: 'bot1', workspace_name: 'Lab', owner: { user: { person: { email: 'me@lab.org' } } } }));
    const signIn = n.connector.auth.signIn;
    if (signIn?.type !== 'oauth2') throw new Error('expected oauth2');
    expect(new URL(signIn.authorizeUrl({ state: 's', redirectUri: 'https://cz.test/cb', codeChallenge: 'c' })).searchParams.get('owner')).toBe('user');
    const c = await signIn.exchange({ code: 'k', redirectUri: 'https://cz.test/cb', codeVerifier: 'v' });
    expect(c).toMatchObject({ accessToken: 'secret_x', account: { id: 'bot1', label: 'Lab (me@lab.org)' }, meta: { workspace: 'Lab' } });
    expect(n.seen[0].headers.authorization).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`);
    expect(n.seen[0].body).toEqual({ grant_type: 'authorization_code', code: 'k', redirect_uri: 'https://cz.test/cb' });
  });

  it('searches what was shared, newest first, with the API version', async () => {
    const n = fakeNotion(() => Response.json({ results: [{ object: 'database', id: DASHED, url: 'https://notion.so/x', title: [{ plain_text: 'Papers' }] }] }));
    const r = await n.connector.open(cred).pages!.search({ query: 'pap', kind: 'database', limit: 5 });
    expect(r).toEqual([{ id: DASHED, title: 'Papers', kind: 'database', url: 'https://notion.so/x', editedAt: null }]);
    expect(n.seen[0].headers['notion-version']).toBe('2022-06-28');
    expect(n.seen[0].body).toMatchObject({ query: 'pap', filter: { property: 'object', value: 'database' }, page_size: 5 });
  });

  it('makes a page in chunks of 100 blocks', async () => {
    const n = fakeNotion((s) => (s.method === 'POST' ? Response.json({ object: 'page', id: 'p-new', url: 'https://notion.so/new', properties: {} }) : Response.json({})));
    const items = Array.from({ length: 150 }, (_, i) => `item ${i}`);
    const page = await n.connector.open(cred).pages!.create({ parentId: ID, title: 'Review', blocks: [{ type: 'bullets', items }] });
    expect(page).toMatchObject({ id: 'p-new', title: 'Review', url: 'https://notion.so/new' });
    const [create, append] = n.seen;
    expect((create.body as { parent: unknown }).parent).toEqual({ page_id: DASHED });
    expect((create.body as { children: unknown[] }).children).toHaveLength(100);
    expect(append.method).toBe('PATCH');
    expect(append.url.pathname).toBe('/v1/blocks/p-new/children');
    expect((append.body as { children: unknown[] }).children).toHaveLength(50);
  });

  it('reads a page with its list children, as markdown', async () => {
    const n = fakeNotion((s) => {
      if (s.url.pathname === `/v1/pages/${DASHED}`) return Response.json({ object: 'page', id: DASHED, url: 'https://notion.so/p', properties: { Name: { type: 'title', title: [{ plain_text: 'Notes' }] } } });
      if (s.url.pathname === `/v1/blocks/${DASHED}/children`)
        return Response.json({
          results: [
            { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Aims' }] } },
            { id: 'b2', type: 'bulleted_list_item', has_children: true, bulleted_list_item: { rich_text: [{ plain_text: 'one' }] } },
          ],
        });
      if (s.url.pathname === '/v1/blocks/b2/children') return Response.json({ results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'detail' }] } }] });
      return new Response('{}', { status: 404 });
    });
    expect(await n.connector.open(cred).pages!.read(ID, 10_000)).toEqual({ title: 'Notes', markdown: '## Aims\n- one\n  detail', url: 'https://notion.so/p' });
  });

  it('adds rows by column name, "title" filling the title column', async () => {
    const n = fakeNotion((s) =>
      s.method === 'GET'
        ? Response.json({ id: DASHED, url: 'https://notion.so/db', title: [{ plain_text: 'Papers' }], properties: { Name: { type: 'title' }, Year: { type: 'number' }, DOI: { type: 'url' }, Tags: { type: 'multi_select' } } })
        : Response.json({ object: 'page', id: 'r' }),
    );
    const r = await n.connector.open(cred).pages!.addRows(ID, [
      { title: 'A', year: 2020, doi: 'https://doi.org/10.1/x', tags: ['ml'], unknown: 'x' },
      { nothing: 'here' },
    ]);
    expect(r).toEqual({ added: 1, url: 'https://notion.so/db' });
    const post = n.seen.find((s) => s.method === 'POST')!;
    expect(post.body).toEqual({
      parent: { database_id: DASHED },
      properties: { Name: { title: [{ type: 'text', text: { content: 'A', link: null } }] }, Year: { number: 2020 }, DOI: { url: 'https://doi.org/10.1/x' }, Tags: { multi_select: [{ name: 'ml' }] } },
    });
  });
});
