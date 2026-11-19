import { z } from 'zod';
import { bulkBody, NAME, NOTE_MAX } from '@/lib/shelf/api/bodies';
import { ShelfError } from '@/lib/shelf/errors';
import { runBulk } from '@/lib/shelf/service/bulk';
import { decideDuplicate } from '@/lib/shelf/service/duplicate-choice';
import { changeItem } from '@/lib/shelf/service/update-item';
import { createFolder, deleteFolder, listFolders, renameFolder } from '@/lib/shelf/store/folders';
import { getItem } from '@/lib/shelf/store/items';
import { createProject, deleteProject, listProjects, renameProject } from '@/lib/shelf/store/projects';
import { createTag, deleteTag, listTags, updateTag } from '@/lib/shelf/store/tags';
import { READING_STATUSES } from '@/lib/shelf/types';
import type { AgentContext } from '../context';
import { itemBrief } from './format';
import { loadGroups } from './library';
import { defineTool } from './types';

/* Organizing the shelf: projects, folders, tags, moving papers, notes and
   reading status, deleting and merging. The same services as /shelf. Deleting,
   merging and changing many papers at once ask the user first. */

/* Changing more papers than this at once asks first. */
export const BULK_CONFIRM_AT = 10;

const ID = z.string().min(1).max(80);
const ITEM_IDS = z.array(ID).min(1).max(500).describe('itemIds from list_library or other shelf results.');
const COLOR = z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('A hex color like "#4f7cff".');

const notFound = (what: string) => new ShelfError('not_found', `That ${what} no longer exists.`);

async function nameOf(ctx: AgentContext, kind: 'project' | 'folder' | 'tag', id: string): Promise<string> {
  const list = kind === 'project' ? await listProjects(ctx.db, ctx.userId) : kind === 'folder' ? await listFolders(ctx.db, ctx.userId) : await listTags(ctx.db, ctx.userId);
  const found = list.find((x) => x.id === id);
  if (!found) throw notFound(kind);
  return found.name;
}

/* "“Title”" for one paper, "these 12 papers" for more. */
async function which(ctx: AgentContext, ids: string[]): Promise<string> {
  const unique = [...new Set(ids)];
  if (unique.length === 1) {
    const item = await getItem(ctx.db, ctx.userId, unique[0]);
    if (item) return `“${item.paper.title.slice(0, 100)}”`;
  }
  return `these ${unique.length} papers`;
}

/* ---- projects, folders, tags ---- */

export const createProjectTool = defineTool({
  name: 'create_project',
  description: 'Create a project (e.g. a thesis or an essay) to group papers.',
  input: z.object({ name: NAME }),
  kind: 'write',
  label: (i) => `Creating project “${i.name}”`,
  run: async (ctx, { name }) => {
    const p = await createProject(ctx.db, ctx.userId, name);
    return { result: { projectId: p.id, name: p.name } };
  },
});

export const renameProjectTool = defineTool({
  name: 'rename_project',
  description: 'Rename a project (an ID from list_collections).',
  input: z.object({ projectId: ID, name: NAME }),
  kind: 'write',
  label: (i) => `Renaming a project to “${i.name}”`,
  run: async (ctx, { projectId, name }) => {
    if (!(await renameProject(ctx.db, ctx.userId, projectId, name))) throw notFound('project');
    return { result: { ok: true } };
  },
});

export const deleteProjectTool = defineTool({
  name: 'delete_project',
  description: 'Delete a project and its folders. Its papers stay on the shelf.',
  input: z.object({ projectId: ID }),
  kind: 'write',
  label: () => 'Deleting a project',
  confirm: async (i, ctx) => `Delete the project “${await nameOf(ctx, 'project', i.projectId)}”? Its papers stay on your shelf.`,
  run: async (ctx, { projectId }) => {
    if (!(await deleteProject(ctx.db, ctx.userId, projectId))) throw notFound('project');
    return { result: { ok: true } };
  },
});

export const createFolderTool = defineTool({
  name: 'create_folder',
  description: 'Create a folder inside a project.',
  input: z.object({ projectId: ID, name: NAME }),
  kind: 'write',
  label: (i) => `Creating folder “${i.name}”`,
  run: async (ctx, { projectId, name }) => {
    const f = await createFolder(ctx.db, ctx.userId, projectId, name);
    return { result: { folderId: f.id, projectId: f.projectId, name: f.name } };
  },
});

export const renameFolderTool = defineTool({
  name: 'rename_folder',
  description: 'Rename a folder (an ID from list_collections).',
  input: z.object({ folderId: ID, name: NAME }),
  kind: 'write',
  label: (i) => `Renaming a folder to “${i.name}”`,
  run: async (ctx, { folderId, name }) => {
    if (!(await renameFolder(ctx.db, ctx.userId, folderId, name))) throw notFound('folder');
    return { result: { ok: true } };
  },
});

export const deleteFolderTool = defineTool({
  name: 'delete_folder',
  description: 'Delete a folder. Its papers stay in the project.',
  input: z.object({ folderId: ID }),
  kind: 'write',
  label: () => 'Deleting a folder',
  confirm: async (i, ctx) => `Delete the folder “${await nameOf(ctx, 'folder', i.folderId)}”? Its papers stay in the project.`,
  run: async (ctx, { folderId }) => {
    if (!(await deleteFolder(ctx.db, ctx.userId, folderId))) throw notFound('folder');
    return { result: { ok: true } };
  },
});

export const createTagTool = defineTool({
  name: 'create_tag',
  description: 'Create a tag. To tag papers, use organize_papers with action "tag" (it can also create tags by name).',
  input: z.object({ name: NAME, color: COLOR }),
  kind: 'write',
  label: (i) => `Creating tag “${i.name}”`,
  run: async (ctx, { name, color }) => {
    const t = await createTag(ctx.db, ctx.userId, name, color ?? null);
    return { result: { tagId: t.id, name: t.name } };
  },
});

export const updateTagTool = defineTool({
  name: 'update_tag',
  description: 'Rename a tag or change its color.',
  input: z.object({ tagId: ID, name: NAME.optional(), color: COLOR }),
  kind: 'write',
  label: () => 'Updating a tag',
  run: async (ctx, { tagId, ...patch }) => {
    if (!(await updateTag(ctx.db, ctx.userId, tagId, patch))) throw notFound('tag');
    return { result: { ok: true } };
  },
});

export const deleteTagTool = defineTool({
  name: 'delete_tag',
  description: 'Delete a tag. The papers stay; only the tag is removed from them.',
  input: z.object({ tagId: ID }),
  kind: 'write',
  label: () => 'Deleting a tag',
  confirm: async (i, ctx) => `Delete the tag “${await nameOf(ctx, 'tag', i.tagId)}”? The papers stay; only the tag goes.`,
  run: async (ctx, { tagId }) => {
    if (!(await deleteTag(ctx.db, ctx.userId, tagId))) throw notFound('tag');
    return { result: { ok: true } };
  },
});

/* ---- papers on the shelf ---- */

const ORGANIZE_ACTIONS = ['move', 'add_to_project', 'remove_from_project', 'add_to_folder', 'remove_from_folder', 'tag', 'untag', 'set_status'] as const;
const BULK_ACTION: Record<(typeof ORGANIZE_ACTIONS)[number], string> = {
  move: 'move',
  add_to_project: 'add_project',
  remove_from_project: 'remove_project',
  add_to_folder: 'add_folder',
  remove_from_folder: 'remove_folder',
  tag: 'tag',
  untag: 'untag',
  set_status: 'status',
};

export const organizePapers = defineTool({
  name: 'organize_papers',
  description:
    'Change one or more saved papers: "move" (into projectId/folderId, or out of every project with neither), "add_to_project", "remove_from_project", "add_to_folder", "remove_from_folder", "tag" (tagIds and/or tagNames; unknown names become new tags), "untag" (tagIds), or "set_status" (status). Changing more than 10 papers asks the user first.',
  input: z.object({
    itemIds: ITEM_IDS,
    action: z.enum(ORGANIZE_ACTIONS),
    projectId: ID.optional(),
    folderId: ID.optional(),
    tagIds: z.array(ID).max(50).optional(),
    tagNames: z.array(NAME).max(20).optional(),
    status: z.enum(READING_STATUSES).optional(),
  }),
  kind: 'write',
  label: (i) => `Updating ${i.itemIds.length === 1 ? 'a paper' : `${i.itemIds.length} papers`}`,
  confirm: async (i, ctx) => (new Set(i.itemIds).size > BULK_CONFIRM_AT ? `Change ${await which(ctx, i.itemIds)} (${i.action.replace(/_/g, ' ')})?` : null),
  async run(ctx, { itemIds, action, ...rest }) {
    const body = bulkBody.parse({ action: BULK_ACTION[action], ids: itemIds, ...rest });
    const r = await runBulk(ctx.db, ctx.userId, body);
    const groups = await loadGroups(ctx);
    return { result: { changed: r.items.length, items: r.items.slice(0, 20).map((i) => itemBrief(i, groups)) }, display: { items: r.items } };
  },
});

export const updateLibraryItem = defineTool({
  name: 'update_library_item',
  description: 'Set a saved paper’s note (replaces it; null clears it) or its reading status (to_read, reading, done).',
  input: z.object({ itemId: ID, note: z.string().max(NOTE_MAX).nullable().optional(), readingStatus: z.enum(READING_STATUSES).optional() }),
  kind: 'write',
  label: (i) => (i.note !== undefined ? 'Writing a note' : 'Setting the reading status'),
  async run(ctx, { itemId, ...changes }) {
    const item = await changeItem(ctx.db, ctx.userId, itemId, changes);
    return { result: itemBrief(item, await loadGroups(ctx)), display: { items: [item] } };
  },
});

export const deletePapers = defineTool({
  name: 'delete_papers',
  description: 'Remove papers from the user’s shelf, with their notes and PDFs. Always asks the user first.',
  input: z.object({ itemIds: ITEM_IDS }),
  kind: 'write',
  label: (i) => `Deleting ${i.itemIds.length === 1 ? 'a paper' : `${i.itemIds.length} papers`}`,
  confirm: async (i, ctx) => `Delete ${await which(ctx, i.itemIds)} from your shelf, with their notes and PDFs? This can’t be undone.`,
  async run(ctx, { itemIds }) {
    const r = await runBulk(ctx.db, ctx.userId, { action: 'delete', ids: itemIds });
    return { result: { deleted: r.deleted.length } };
  },
});

export const resolveDuplicate = defineTool({
  name: 'resolve_duplicate',
  description: 'For a pair from find_duplicates: "merge" them into one (keeps the fuller record, every note, tag, project and PDF; asks the user first), or "keep_both" (stops offering the pair).',
  input: z.object({ action: z.enum(['merge', 'keep_both']), itemA: ID, itemB: ID }),
  kind: 'write',
  label: (i) => (i.action === 'merge' ? 'Merging two papers' : 'Keeping both papers'),
  confirm: async (i, ctx) => (i.action === 'merge' ? `Merge ${await which(ctx, [i.itemA])} and ${await which(ctx, [i.itemB])} into one paper?` : null),
  async run(ctx, { action, itemA, itemB }) {
    const r = await decideDuplicate(ctx.db, ctx.userId, action, itemA, itemB);
    if ('item' in r) return { result: { kept: itemBrief(r.item, await loadGroups(ctx)), removedItemId: r.removedId }, display: { items: [r.item] } };
    return { result: r };
  },
});

export const ORGANIZE_TOOLS = [
  createProjectTool,
  renameProjectTool,
  deleteProjectTool,
  createFolderTool,
  renameFolderTool,
  deleteFolderTool,
  createTagTool,
  updateTagTool,
  deleteTagTool,
  organizePapers,
  updateLibraryItem,
  deletePapers,
  resolveDuplicate,
];
