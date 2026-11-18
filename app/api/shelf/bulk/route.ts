import { json } from '@/lib/http';
import { bulkBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { runBulk } from '@/lib/shelf/service/bulk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Move, tag, add to a project, set status or delete several papers at once. */
export const POST = shelfRoute(async (ctx) => json(await runBulk(ctx.db, ctx.userId, await ctx.body(bulkBody))));
