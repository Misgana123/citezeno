import { after } from 'next/server';
import { z } from 'zod';
import { json } from '@/lib/http';
import { connectorErrorResponse } from '@/lib/connectors/route';
import { capabilityOpener } from '@/lib/connectors/access';
import { connectorDeps } from '@/lib/connectors/server';
import { importReferences } from '@/lib/connectors/service/import-references';
import { shelfRoute } from '@/lib/shelf/route';
import { runImportSlice } from '@/lib/shelf/service/import-run';
import { getImport } from '@/lib/shelf/store/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({
  libraryId: z.string().regex(/^(user|group:\d{1,12})$/),
  collectionKey: z.string().regex(/^[A-Z0-9]{8}$/).nullish(),
  name: z.string().trim().min(1).max(200),
  projectId: z.string().min(1).max(80).nullish(),
  newProject: z.string().trim().min(1).max(120).nullish(),
  sync: z.boolean().optional(),
});

/* Import a library or collection from the connected reference manager (or
   sync it: only what changed since last time). The import then runs like a
   file import: the page follows it, the background job finishes it. */
export const POST = shelfRoute(async (ctx) => {
  const b = await ctx.body(body);
  try {
    const out = await importReferences(capabilityOpener(connectorDeps(), ctx.userId), { db: ctx.db, config: ctx.config }, ctx.userId, b);
    if (!out.importId) return json({ ...out, import: null });
    const id = out.importId;
    const papers = ctx.sources().primary;
    after(() => runImportSlice({ db: ctx.db, papers }, { id, budgetMs: 45_000 }).catch((e) => console.error('[citezeno] connectors: import run failed', e)));
    return json({ ...out, import: await getImport(ctx.db, ctx.userId, id) }, 201);
  } catch (e) {
    return connectorErrorResponse(e);
  }
});
