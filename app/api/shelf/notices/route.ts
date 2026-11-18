import { json } from '@/lib/http';
import { noticesReadBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { markNoticesRead, unreadNotices } from '@/lib/shelf/store/notices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Unread notices (papers retracted after they were saved). */
export const GET = shelfRoute(async ({ db, userId }) => json(await unreadNotices(db, userId)));

export const POST = shelfRoute(async (ctx) => {
  const { ids } = await ctx.body(noticesReadBody);
  return json({ read: await markNoticesRead(ctx.db, ctx.userId, ids) });
});
