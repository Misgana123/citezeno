import { z } from 'zod';
import type { PageBlock } from '@/lib/providers/connectors/types';
import { ShelfError } from '@/lib/shelf/errors';
import { sendShelf, SEND_MAX } from '@/lib/connectors/service/send-shelf';
import { shelfRows } from '@/lib/connectors/service/shelf-rows';
import { blockSchema, DOC_BLOCKS_MAX, DOC_TEXT_MAX, textLength, type DocBlock } from '../../documents/blocks';
import { listFilters, listQuery } from '../library';
import { defineTool, tally } from '../types';
import { app, appLabel, clip, opener, READ_CHARS } from './shared';

/* The user's connected notes app (Notion): the pages and databases they shared. */

const NOTION_ID = z.string().trim().min(32).max(300).describe('A page or database ID (or its link), from notes_search.');

/* The app's content blocks from the assistant's document blocks. */
export function pageBlocks(blocks: DocBlock[]): PageBlock[] {
  return blocks.flatMap((b): PageBlock[] => {
    switch (b.type) {
      case 'heading':
        return [{ type: 'heading', level: (b.level ?? 1) as 1 | 2 | 3, text: b.text }];
      case 'paragraph':
      case 'quote':
        return [{ type: b.type, text: b.text }];
      case 'bullets':
      case 'numbered':
        return [{ type: b.type, items: b.items }];
      case 'table':
        return [{ type: 'table', headers: b.headers, rows: b.rows }];
      case 'references':
        return [{ type: 'heading', level: 2, text: b.title ?? 'References' }, { type: 'numbered', items: b.items }];
      case 'page_break':
        return [{ type: 'divider' }];
      case 'image':
        return [];
    }
  });
}

export const notesSearch = defineTool({
  name: 'notes_search',
  description: 'Find pages and databases the user shared with Citezeno from their connected notes app (Notion), newest first, optionally by title words or kind. Pages they didn’t share are invisible: ask them to add Citezeno to the page in Notion (••• → Connections).',
  input: z.object({ query: z.string().trim().max(200).optional(), kind: z.enum(['page', 'database']).optional(), limit: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'pages',
  label: (i) => (i.query ? `Looking for “${clip(i.query, 50)}” in your notes` : 'Looking through your notes'),
  done: (i) => ({ did: 'Looked through your notes', ...(i.query ? { about: i.query } : {}) }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'pages');
    const items = await api.search({ query: i.query, kind: i.kind, limit: i.limit ?? 20 });
    return { result: { items }, display: { summary: tally(items.length, 'page') } };
  },
});

export const notesReadPage = defineTool({
  name: 'notes_read_page',
  description: `Read a page the user shared from their notes app (Notion), as markdown (at most ${READ_CHARS.toLocaleString('en-US')} characters).`,
  input: z.object({ pageId: NOTION_ID }),
  kind: 'read',
  step: 'read',
  needs: 'pages',
  label: () => 'Reading a page from your notes',
  done: () => ({ did: 'Read a page from your notes' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'pages');
    const p = await api.read(i.pageId, READ_CHARS);
    return { result: p, display: { ...(p.url ? { links: [{ title: p.title, url: p.url }] } : {}), summary: `${p.markdown.length.toLocaleString('en-US')} characters` } };
  },
});

export const notesCreatePage = defineTool({
  name: 'notes_create_page',
  description:
    'Make a new page in the user’s notes app (Notion), inside a page they shared (parentId, from notes_search). Content uses the document blocks (heading, paragraph, bullets, numbered, quote, table, references; **bold**, *italic*, `code`, [links](https://…)); pictures aren’t carried over. Asks the user first.',
  input: z.object({ parentId: NOTION_ID, title: z.string().trim().min(1).max(300), blocks: z.array(blockSchema).min(1).max(DOC_BLOCKS_MAX) }),
  kind: 'write',
  step: 'make',
  needs: 'pages',
  label: (i) => `Making a page “${clip(i.title, 60)}” in your notes`,
  done: (i) => ({ did: 'Made a page in your notes', about: i.title }),
  confirm: (i, ctx) => `Make a page “${i.title}” in ${appLabel(ctx, 'pages', 'your notes app')}?`,
  async run(ctx, i) {
    if (textLength(i.blocks) > DOC_TEXT_MAX) throw new ShelfError('too_large', 'The page is too long. Split it into parts.');
    const { api, label } = await app(ctx, 'pages');
    const p = await api.create({ parentId: i.parentId, title: i.title, blocks: pageBlocks(i.blocks) });
    return { result: { made: p.title, url: p.url, app: label }, display: { ...(p.url ? { links: [{ title: p.title, url: p.url }] } : {}), summary: 'Page ready' } };
  },
});

const VALUE = z.union([z.string().max(2000), z.number(), z.boolean(), z.null(), z.array(z.string().max(100)).max(50)]);

export const notesAddRows = defineTool({
  name: 'notes_add_rows',
  description: `Add rows to a database the user shared from their notes app (Notion; databaseId from notes_search). Either give rows (values by column name; "title" fills the title column) or send shelf papers: itemIds, or every paper matching the shelf filters (columns named Title, Authors, Year, Source, DOI, Link, Tags… are filled). At most ${SEND_MAX} papers. Asks the user first.`,
  input: z.object({ databaseId: NOTION_ID, rows: z.array(z.record(z.string().max(100), VALUE)).max(500).optional(), itemIds: z.array(z.string().min(1).max(80)).max(SEND_MAX).optional(), ...listFilters }),
  kind: 'write',
  step: 'change',
  needs: 'pages',
  label: () => 'Adding rows to a database in your notes',
  done: (i) => ({ did: 'Added rows to a notes database', ...(i.rows ? { about: tally(i.rows.length, 'row').toLowerCase() } : {}) }),
  async confirm(i, ctx) {
    const { api } = await app(ctx, 'pages');
    const { title } = await api.columns(i.databaseId);
    return i.rows ? `Add ${tally(i.rows.length, 'row').toLowerCase()} to “${title}”?` : `Add ${i.itemIds ? tally(i.itemIds.length, 'paper').toLowerCase() : 'these shelf papers'} to “${title}”?`;
  },
  async run(ctx, i) {
    if (i.rows?.length) {
      const { api } = await app(ctx, 'pages');
      const r = await api.addRows(i.databaseId, i.rows);
      return { result: r, display: { ...(r.url ? { links: [{ title: 'The database', url: r.url }] } : {}), summary: `${tally(r.added, 'row')} added` } };
    }
    const { rows } = await shelfRows(ctx.db, ctx.userId, (page, perPage) => listQuery(i, page, perPage), SEND_MAX);
    const r = await sendShelf(opener(ctx), rows, { to: 'pages', databaseId: i.databaseId });
    return { result: r, display: { ...(r.url ? { links: [{ title: r.where, url: r.url }] } : {}), summary: `${tally(r.sent, 'paper')} added` } };
  },
});

export const NOTES_TOOLS = [notesSearch, notesReadPage, notesCreatePage, notesAddRows];
