import { ProviderError } from '../errors';
import type { NotesColumn, NotesItem, NotesPages } from '../connectors/types';
import { blockToMarkdown, plainText, titleOf, toNotionBlocks, type ReadBlock } from './blocks';
import { PROVIDER, type NotionCall } from './http';

/* Notion pages and databases the user shared with Citezeno. */

/* Blocks per request when making a page (Notion's limit), and the most read back. */
const BLOCKS_PER_CALL = 100;
const READ_BLOCKS_MAX = 600;

type Item = { object: 'page' | 'database'; id: string; url?: string; last_edited_time?: string; properties?: Record<string, { type?: string }>; title?: { plain_text?: string }[] };

const toItem = (r: Item): NotesItem => ({ id: r.id, title: titleOf(r as never), kind: r.object, url: r.url ?? null, editedAt: r.last_edited_time ?? null });

/* Notion IDs come with or without dashes, or inside a link: keep the 32 hex digits. */
export function notionId(v: string): string {
  // the ID ends the link's path ("…/My-page-<id>?pvs=4")
  const hex = v.trim().split(/[?#]/)[0].replace(/\/+$/, '').replace(/-/g, '').match(/[0-9a-f]{32}$/i)?.[0];
  if (!hex) throw new ProviderError('bad_request', 'That isn’t a Notion page or database ID.', { provider: PROVIDER });
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
}

const COLUMN_TYPES: Record<string, NotesColumn['type']> = { title: 'title', rich_text: 'text', number: 'number', url: 'url', date: 'date', select: 'select', multi_select: 'multi_select', checkbox: 'checkbox' };

type Value = string | number | boolean | null | string[];

/* A date from what a paper has: "2021", "2021-05" or a full date. */
function dateValue(v: Value): string | null {
  const s = String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

const optionName = (s: string) => s.replace(/,/g, ' ').trim().slice(0, 100);

/* One value for a column, in Notion's shape; undefined to leave it empty. */
export function propertyValue(type: string, v: Value): unknown {
  if (v == null || v === '') return undefined;
  const text = Array.isArray(v) ? v.join(', ') : String(v);
  switch (type) {
    case 'title':
      return { title: plainText(text) };
    case 'rich_text':
      return { rich_text: plainText(text) };
    case 'number': {
      const n = typeof v === 'number' ? v : Number(text);
      return Number.isFinite(n) ? { number: n } : undefined;
    }
    case 'url':
      return /^https?:\/\//i.test(text) ? { url: text } : undefined;
    case 'date': {
      const d = dateValue(v);
      return d ? { date: { start: d } } : undefined;
    }
    case 'select':
      return optionName(text) ? { select: { name: optionName(text) } } : undefined;
    case 'multi_select': {
      const names = (Array.isArray(v) ? v : text.split(',')).map((x) => optionName(String(x))).filter(Boolean);
      return names.length ? { multi_select: [...new Set(names)].slice(0, 100).map((name) => ({ name })) } : undefined;
    }
    case 'checkbox':
      return { checkbox: typeof v === 'boolean' ? v : /^(true|yes|1)$/i.test(text) };
    case 'email':
      return { email: text };
    default:
      return undefined;
  }
}

export function notionPages(call: NotionCall): NotesPages {
  const database = (id: string) => call<{ id: string; url?: string; title?: { plain_text?: string }[]; properties?: Record<string, { type: string }> }>({ method: 'GET', path: `/databases/${notionId(id)}` });

  return {
    async search({ query, kind, limit }) {
      const r = await call<{ results?: Item[] }>({
        method: 'POST',
        path: '/search',
        json: { ...(query?.trim() ? { query: query.trim() } : {}), ...(kind ? { filter: { property: 'object', value: kind } } : {}), sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: Math.min(100, Math.max(1, limit)) },
      });
      return (r.results ?? []).map(toItem);
    },

    async read(id, maxChars) {
      const pageId = notionId(id);
      const page = await call<Item>({ method: 'GET', path: `/pages/${pageId}` });
      const lines: string[] = [];
      let size = 0;
      let cut = false;
      /* top-level blocks, and one level inside (list items, toggles, tables) */
      const walk = async (blockId: string, indent: string, depth: number) => {
        let cursor: string | undefined;
        let n = 0;
        let read = 0;
        do {
          const r = await call<{ results?: ReadBlock[]; next_cursor?: string | null; has_more?: boolean }>({ method: 'GET', path: `/blocks/${blockId}/children`, query: { page_size: 100, start_cursor: cursor } });
          for (const b of r.results ?? []) {
            n = b.type === 'numbered_list_item' ? n + 1 : 0;
            const line = blockToMarkdown(b, n);
            if (line) {
              lines.push(indent + line.replace(/\n/g, `\n${indent}`));
              size += line.length + 1;
            }
            if (size > maxChars || ++read > READ_BLOCKS_MAX) {
              cut = true;
              return;
            }
            if (b.has_children && depth < 1 && b.type !== 'child_page' && b.type !== 'child_database') await walk((b as { id?: string }).id ?? '', `${indent}  `, depth + 1);
            if (cut) return;
          }
          cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
        } while (cursor);
      };
      await walk(pageId, '', 0);
      const markdown = lines.join('\n').slice(0, maxChars);
      return { title: titleOf(page as never), markdown: cut ? `${markdown}\n\n[The page is longer; the rest was left out.]` : markdown, url: page.url ?? null };
    },

    async create({ parentId, title, blocks }) {
      const children = toNotionBlocks(blocks);
      const page = await call<Item>({
        method: 'POST',
        path: '/pages',
        json: { parent: { page_id: notionId(parentId) }, properties: { title: { title: plainText(title.slice(0, 2000)) } }, children: children.slice(0, BLOCKS_PER_CALL) },
      });
      for (let i = BLOCKS_PER_CALL; i < children.length; i += BLOCKS_PER_CALL) {
        await call({ method: 'PATCH', path: `/blocks/${page.id}/children`, json: { children: children.slice(i, i + BLOCKS_PER_CALL) } });
      }
      return { ...toItem(page), title: title || toItem(page).title };
    },

    async columns(databaseId) {
      const db = await database(databaseId);
      return {
        title: titleOf(db as never),
        columns: Object.entries(db.properties ?? {}).map(([name, p]) => ({ name, type: COLUMN_TYPES[p.type] ?? 'other' })),
      };
    },

    async addRows(databaseId, rows) {
      const db = await database(databaseId);
      const props = Object.entries(db.properties ?? {});
      const byName = new Map(props.map(([name, p]) => [name.toLowerCase(), { name, type: p.type }]));
      const titleColumn = props.find(([, p]) => p.type === 'title')?.[0];
      let added = 0;
      for (const row of rows) {
        const properties: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          // "title" fills the database's title column, whatever it's called
          const col = byName.get(k.toLowerCase()) ?? (k.toLowerCase() === 'title' && titleColumn ? byName.get(titleColumn.toLowerCase()) : undefined);
          if (!col) continue;
          const value = propertyValue(col.type, v);
          if (value !== undefined) properties[col.name] = value;
        }
        if (!Object.keys(properties).length) continue;
        await call({ method: 'POST', path: '/pages', json: { parent: { database_id: db.id }, properties } });
        added++;
      }
      return { added, url: db.url ?? null };
    },
  };
}

