import { z } from 'zod';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { duplicatePairs } from '@/lib/shelf/dedupe/possible';
import { ShelfError } from '@/lib/shelf/errors';
import { LIST_SORTS, UNSORTED, type ListQuery } from '@/lib/shelf/store/list-query';
import { getItem, listItems } from '@/lib/shelf/store/items';
import { listFolders } from '@/lib/shelf/store/folders';
import { unreadNotices } from '@/lib/shelf/store/notices';
import { listProjects } from '@/lib/shelf/store/projects';
import { listTags } from '@/lib/shelf/store/tags';
import { READING_STATUSES } from '@/lib/shelf/types';
import type { AgentContext } from '../context';
import { itemBrief, paperBrief, type Groups } from './format';
import { defineTool, tally } from './types';

/* Reading the user's shelf (My shelf): the same listing, search and filters as /shelf. */

export async function loadGroups(ctx: AgentContext): Promise<Groups> {
  const [projects, folders, tags] = await Promise.all([listProjects(ctx.db, ctx.userId), listFolders(ctx.db, ctx.userId), listTags(ctx.db, ctx.userId)]);
  return { projects, folders, tags };
}

export const listFilters = {
  search: z.string().max(500).optional().describe('Words to find in titles, authors, abstracts, tags, notes and PDF text.'),
  projectId: z.string().max(80).optional().describe(`A project ID, or "${UNSORTED}" for papers in no project.`),
  folderId: z.string().max(80).optional(),
  tagId: z.string().max(80).optional(),
  status: z.enum(READING_STATUSES).optional(),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  openAccess: z.boolean().optional(),
  retracted: z.boolean().optional().describe('true: only retracted papers.'),
  hasPdf: z.boolean().optional(),
  sort: z.enum(LIST_SORTS).optional(),
};

type ListFilters = { [K in keyof typeof listFilters]?: z.infer<(typeof listFilters)[K]> };

/* The tool's filters as the query string /api/shelf/papers reads, validated the same way. */
export function listQuery(f: ListFilters & { itemIds?: string[] }, page: number, perPage: number): ListQuery {
  const qs = new URLSearchParams();
  const set = (k: string, v: unknown) => v != null && v !== '' && qs.set(k, String(v));
  set('q', f.search);
  set('project', f.projectId);
  set('folder', f.folderId);
  set('tag', f.tagId);
  set('status', f.status);
  set('from', f.yearFrom);
  set('to', f.yearTo);
  if (f.openAccess != null) qs.set('oa', f.openAccess ? '1' : '0');
  if (f.retracted != null) qs.set('retracted', f.retracted ? '1' : '0');
  if (f.hasPdf != null) qs.set('pdf', f.hasPdf ? '1' : '0');
  set('sort', f.sort ?? (f.search ? 'relevance' : undefined));
  if (f.itemIds?.length) qs.set('ids', f.itemIds.join(','));
  qs.set('page', String(page));
  qs.set('perPage', String(perPage));
  return parseListRequest(qs);
}

export const listLibrary = defineTool({
  name: 'list_library',
  description:
    'List or search the papers saved on the user’s shelf, with filters (project, folder, tag, reading status, year, open access, retracted, has PDF). Use this to answer questions about what the user has saved.',
  input: z.object({ ...listFilters, page: z.number().int().min(1).optional(), perPage: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  label: (i) => (i.search ? `Searching your shelf for “${i.search.slice(0, 60)}”` : 'Reading your shelf'),
  async run(ctx, { page = 1, perPage = 25, ...f }) {
    const [list, groups] = await Promise.all([listItems(ctx.db, ctx.userId, listQuery(f, page, perPage)), loadGroups(ctx)]);
    return {
      result: { total: list.total, page: list.page, hasMore: list.page * list.perPage < list.total, items: list.items.map((i) => itemBrief(i, groups)) },
      display: { items: list.items, summary: tally(list.total, 'paper') },
    };
  },
});

export const getLibraryItem = defineTool({
  name: 'get_library_item',
  description: 'One saved paper with its full details, note, reading status, projects, folders, tags and PDFs (each with its pdfId, for the PDF tools).',
  input: z.object({ itemId: z.string().min(1).max(80) }),
  kind: 'read',
  label: () => 'Opening a saved paper',
  async run(ctx, { itemId }) {
    const [item, groups] = await Promise.all([getItem(ctx.db, ctx.userId, itemId), loadGroups(ctx)]);
    if (!item) throw new ShelfError('not_found', 'That paper is not on your shelf.');
    return {
      result: { ...itemBrief(item, groups), note: item.note, pdfFiles: item.pdfs.map((f) => ({ pdfId: f.id, fileName: f.fileName, pages: f.pageCount })), details: paperBrief({ ...item.paper, provider: item.paper.provider ?? '' }, { fullAbstract: true }) },
      display: { items: [item], summary: 'Opened' },
    };
  },
});

export const listCollections = defineTool({
  name: 'list_collections',
  description: 'The user’s projects, folders (each inside a project) and tags, with their IDs and paper counts. Use it to find IDs by name before organizing papers.',
  input: z.object({}),
  kind: 'read',
  label: () => 'Reading your projects, folders and tags',
  async run(ctx) {
    const g = await loadGroups(ctx);
    return {
      result: {
        projects: g.projects.map((p) => ({ projectId: p.id, name: p.name, papers: p.count })),
        folders: g.folders.map((f) => ({ folderId: f.id, projectId: f.projectId, name: f.name, papers: f.count })),
        tags: g.tags.map((t) => ({ tagId: t.id, name: t.name, papers: t.count })),
      },
      display: { summary: `${tally(g.projects.length, 'project')} · ${tally(g.folders.length, 'folder')} · ${tally(g.tags.length, 'tag')}` },
    };
  },
});

export const findDuplicates = defineTool({
  name: 'find_duplicates',
  description: 'Pairs of saved papers that look like the same paper (same DOI or record, or very similar titles), minus pairs the user chose to keep.',
  input: z.object({}),
  kind: 'read',
  label: () => 'Looking for duplicates',
  async run(ctx) {
    const [pairs, groups] = await Promise.all([duplicatePairs(ctx.db, ctx.userId), loadGroups(ctx)]);
    return { result: { pairs: pairs.map((p) => ({ reason: p.reason, a: itemBrief(p.a, groups), b: itemBrief(p.b, groups) })) }, display: { items: pairs.flatMap((p) => [p.a, p.b]), summary: tally(pairs.length, 'pair') } };
  },
});

export const listNotices = defineTool({
  name: 'list_retraction_notices',
  description: 'Unread notices about saved papers that were retracted after the user saved them.',
  input: z.object({}),
  kind: 'read',
  label: () => 'Checking retraction notices',
  async run(ctx) {
    const r = await unreadNotices(ctx.db, ctx.userId);
    return { result: r, display: { summary: r.unread ? tally(r.unread, 'new notice') : 'No new notices' } };
  },
});

export const LIBRARY_TOOLS = [listLibrary, getLibraryItem, listCollections, findDuplicates, listNotices];
