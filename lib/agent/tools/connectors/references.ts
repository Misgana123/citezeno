import { z } from 'zod';
import { importReferences } from '@/lib/connectors/service/import-references';
import { sendShelf, SEND_MAX } from '@/lib/connectors/service/send-shelf';
import { shelfRows } from '@/lib/connectors/service/shelf-rows';
import { runImportSlice } from '@/lib/shelf/service/import-run';
import { getImport } from '@/lib/shelf/store/imports';
import { listFilters, listQuery } from '../library';
import { defineTool, tally } from '../types';
import { app, appLabel, clip, opener } from './shared';

/* The user's connected reference manager (Zotero). */

const LIBRARY = z
  .string()
  .regex(/^(user|group:\d{1,12})$/)
  .optional()
  .describe('"user" (default, their own library) or "group:<id>" from ref_library_collections.');
const COLLECTION = z.string().regex(/^[A-Z0-9]{8}$/).describe('A collection key from ref_library_collections.');

/* How long the import may run inside the reply; the background job finishes the rest. */
const IMPORT_BUDGET_MS = 15_000;

export const refLibrarySearch = defineTool({
  name: 'ref_library_search',
  description: 'Search the user’s connected reference manager (Zotero) by title, author or year words. Returns references with DOIs where known (to look up or save with the paper tools).',
  input: z.object({ query: z.string().trim().min(1).max(200), libraryId: LIBRARY, limit: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'references',
  label: (i) => `Searching your reference library for “${clip(i.query, 50)}”`,
  done: (i) => ({ did: 'Searched your reference library', about: i.query }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'references');
    const items = await api.search(i.libraryId ?? 'user', i.query, i.limit ?? 20);
    return { result: { items: items.map(({ version: _v, collections: _c, ...it }) => it) }, display: { summary: tally(items.length, 'reference') } };
  },
});

export const refLibraryCollections = defineTool({
  name: 'ref_library_collections',
  description: 'List the user’s reference manager libraries (their own and groups, with whether Citezeno may change them) and one library’s collections.',
  input: z.object({ libraryId: LIBRARY }),
  kind: 'read',
  step: 'read',
  needs: 'references',
  label: () => 'Listing your reference library’s collections',
  done: () => ({ did: 'Listed your reference collections' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'references');
    const [libraries, collections] = await Promise.all([api.libraries(), api.collections(i.libraryId ?? 'user')]);
    return { result: { libraries, libraryId: i.libraryId ?? 'user', collections }, display: { summary: tally(collections.length, 'collection') } };
  },
});

export const refLibraryImport = defineTool({
  name: 'ref_library_import',
  description:
    'Bring the user’s reference manager library (Zotero), or one collection, onto their shelf, the same as the shelf’s import: papers with a DOI get full details, papers already there are skipped. sync: only what changed since the last import of the same library or collection. newProject puts them in a new project. Asks the user first.',
  input: z.object({ libraryId: LIBRARY, collectionKey: COLLECTION.optional(), newProject: z.string().trim().min(1).max(120).optional(), sync: z.boolean().optional() }),
  kind: 'write',
  step: 'shelf',
  needs: 'references',
  label: (i) => (i.sync ? 'Syncing your reference library' : 'Importing from your reference library'),
  done: (i) => ({ did: i.sync ? 'Synced your reference library' : 'Imported from your reference library' }),
  confirm: (i, ctx) => `${i.sync ? 'Sync' : 'Import'} ${i.collectionKey ? 'this collection' : 'your whole library'} from ${appLabel(ctx, 'references', 'your reference manager')} onto your shelf${i.newProject ? `, into a new project “${i.newProject}”` : ''}?`,
  async run(ctx, i) {
    const libraryId = i.libraryId ?? 'user';
    let name = libraryId === 'user' ? 'My Library' : libraryId;
    if (i.collectionKey) {
      const { api } = await app(ctx, 'references');
      name = (await api.collections(libraryId)).find((c) => c.key === i.collectionKey)?.name ?? 'Collection';
    }
    const out = await importReferences(opener(ctx), { db: ctx.db, config: ctx.shelfConfig }, ctx.userId, { libraryId, collectionKey: i.collectionKey, name, newProject: i.newProject, sync: i.sync });
    if (!out.importId) return { result: { found: 0, note: i.sync ? 'Nothing new since the last sync.' : 'Nothing to import.' }, display: { summary: 'Nothing new' } };
    await runImportSlice({ db: ctx.db, papers: ctx.sources().primary }, { id: out.importId, budgetMs: IMPORT_BUDGET_MS }).catch((e) => console.warn('[citezeno] agent: import slice failed', (e as Error).message));
    const s = await getImport(ctx.db, ctx.userId, out.importId);
    return {
      result: { found: out.found, status: s?.status, counts: s?.counts, ...(s?.status === 'queued' ? { note: 'The rest carries on in the background; it shows on the shelf as it lands.' } : {}) },
      display: { summary: `${tally(out.found, 'reference')} ${s?.status === 'done' ? 'imported' : 'importing'}` },
    };
  },
});

export const refLibraryAddPapers = defineTool({
  name: 'ref_library_add_papers',
  description: `Send shelf papers to the user’s reference manager (Zotero): itemIds, or every paper matching the shelf filters; into a collection (collectionKey), a new collection (newCollection) or just the library. At most ${SEND_MAX}. Asks the user first.`,
  input: z.object({ libraryId: LIBRARY, collectionKey: COLLECTION.optional(), newCollection: z.string().trim().min(1).max(200).optional(), itemIds: z.array(z.string().min(1).max(80)).max(SEND_MAX).optional(), ...listFilters }),
  kind: 'write',
  step: 'change',
  needs: 'references',
  label: () => 'Sending papers to your reference library',
  done: (i) => ({ did: 'Sent papers to your reference library', ...(i.newCollection ? { about: i.newCollection } : {}) }),
  async confirm(i, ctx) {
    const { total } = await shelfRows(ctx.db, ctx.userId, (page, perPage) => listQuery(i, page, perPage), 1);
    return `Send ${tally(Math.min(total, SEND_MAX), 'paper').toLowerCase()} to ${appLabel(ctx, 'references', 'your reference manager')}${i.newCollection ? `, in a new collection “${i.newCollection}”` : ''}?`;
  },
  async run(ctx, i) {
    const { rows } = await shelfRows(ctx.db, ctx.userId, (page, perPage) => listQuery(i, page, perPage), SEND_MAX);
    const r = await sendShelf(opener(ctx), rows, { to: 'references', libraryId: i.libraryId ?? 'user', collectionKey: i.collectionKey, newCollection: i.newCollection });
    return { result: r, display: { summary: `${tally(r.sent, 'paper')} sent` } };
  },
});

export const REFERENCE_TOOLS = [refLibrarySearch, refLibraryCollections, refLibraryImport, refLibraryAddPapers];
