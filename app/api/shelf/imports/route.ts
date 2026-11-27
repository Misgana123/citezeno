import { after } from 'next/server';
import { json } from '@/lib/http';
import { importBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { runImportSlice } from '@/lib/shelf/service/import-run';
import { startImport } from '@/lib/shelf/service/import-start';
import { getImport, recentImports } from '@/lib/shelf/store/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = shelfRoute(async ({ db, userId }) => json({ imports: await recentImports(db, userId) }));

/* Queue an import, and start on it as soon as the answer is sent. The page
   keeps it moving while open; the background job finishes it otherwise. */
export const POST = shelfRoute(async (ctx) => {
  const body = await ctx.body(importBody);
  const id = await startImport(ctx.db, ctx.config, ctx.userId, body);
  const papers = ctx.sources().primary;
  after(() => runImportSlice({ db: ctx.db, papers }, { id, budgetMs: 45_000 }).catch((e) => console.error('[citezeno] shelf: import run failed', e)));
  return json(await getImport(ctx.db, ctx.userId, id), 201);
});
