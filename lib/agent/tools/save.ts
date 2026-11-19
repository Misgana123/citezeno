import { z } from 'zod';
import { manualPaperSchema } from '@/lib/shelf/api/manual-schema';
import { possibleDuplicatesOf } from '@/lib/shelf/dedupe/possible';
import { lookupPaper } from '@/lib/shelf/service/lookup';
import { saveFoundPaper } from '@/lib/shelf/service/save-found';
import { saveManualPaper } from '@/lib/shelf/service/save-manual';
import type { ShelfItem } from '@/lib/shelf/types';
import type { AgentContext } from '../context';
import { itemBrief, paperBrief } from './format';
import { loadGroups } from './library';
import { defineTool } from './types';

/* Adding papers to the shelf: the same lookups and saves as "Add a paper" and
   the Save buttons in Find Papers. */

const PROJECT_ID = z.string().max(80).optional().describe('Also put it in this project (an ID from list_collections).');

async function saved(ctx: AgentContext, item: ShelfItem, extra: Record<string, unknown> = {}) {
  const [groups, dups] = await Promise.all([loadGroups(ctx), possibleDuplicatesOf(ctx.db, ctx.userId, item.id)]);
  return {
    result: { saved: itemBrief(item, groups), ...extra, ...(dups.length ? { possibleDuplicates: dups.map((d) => ({ itemId: d.id, title: d.paper.title, year: d.paper.year })) } : {}) },
    display: { items: [item] },
  };
}

/* A paper that is already on the shelf is not an error for the agent: it says so and gives the item. */
async function orAlreadySaved(ctx: AgentContext, save: () => Promise<{ result: unknown; display?: { items?: ShelfItem[] } }>) {
  try {
    return await save();
  } catch (e) {
    const err = e as { code?: string; details?: { itemId?: string } };
    if (err.code === 'duplicate' && err.details?.itemId) return { result: { alreadyOnShelf: true, itemId: err.details.itemId } };
    throw e;
  }
}

export const lookupPaperTool = defineTool({
  name: 'lookup_paper',
  description:
    'Find a paper from a DOI, a link (doi.org, arXiv, PubMed, publisher pages, paper database links) or a title, before saving it. IDs and links are free lookups; a title is one search toward the daily limit and returns up to 5 matches. Says which matches are already saved.',
  input: z.object({ input: z.string().min(1).max(2000).describe('The DOI, link or title.') }),
  kind: 'read',
  label: (i) => `Looking up “${i.input.slice(0, 60)}”`,
  async run(ctx, { input }) {
    const r = await lookupPaper({ db: ctx.db, sources: ctx.sources(), reserveSearches: ctx.reserveSearches }, ctx.userId, input);
    return { result: { via: r.via, papers: r.papers.map((p) => ({ ...paperBrief(p), savedItemId: r.saved[p.id] ?? null })) }, display: { papers: r.papers } };
  },
});

export const savePaper = defineTool({
  name: 'save_paper',
  description: 'Save a paper found by search_papers, lookup_paper or the other paper tools to the user’s shelf, optionally into a project. Its details always come from the paper database, never from the conversation.',
  input: z.object({ paperId: z.string().min(1).max(240), projectId: PROJECT_ID }),
  kind: 'write',
  label: () => 'Saving a paper to your shelf',
  run: (ctx, { paperId, projectId }) =>
    orAlreadySaved(ctx, async () => {
      const { item, pending } = await saveFoundPaper({ db: ctx.db, sources: ctx.sources() }, ctx.userId, { paperId, via: 'search', projectId: projectId ?? null });
      return saved(ctx, item, pending ? { note: 'Saved; its details will be refreshed once the paper database is reachable.' } : {});
    }),
});

export const addPaperManually = defineTool({
  name: 'add_paper_manually',
  description: 'Add a paper by typing its details, only when the user gives details for a paper that lookup_paper cannot find. Never invent details the user did not give.',
  input: z.object({ details: manualPaperSchema, projectId: PROJECT_ID }),
  kind: 'write',
  label: (i) => `Adding “${i.details.title.slice(0, 60)}” by hand`,
  run: (ctx, { details, projectId }) => orAlreadySaved(ctx, async () => saved(ctx, await saveManualPaper(ctx.db, ctx.userId, details, projectId ?? null))),
});

export const SAVE_TOOLS = [lookupPaperTool, savePaper, addPaperManually];
