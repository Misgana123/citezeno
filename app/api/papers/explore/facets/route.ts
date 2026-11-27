import { json } from '@/lib/http';
import { exploreCounts } from '@/lib/papers/explore/feed';
import { parseExploreQuery } from '@/lib/papers/explore/query';
import { papersRoute } from '@/lib/papers/route';
import { exploreDeps } from '@/lib/papers/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* How many papers each Explore filter choice would show (same parameters as the feed);
   { facets: null } while the feed comes from the live listing. */
export const GET = papersRoute(async (ctx) => json({ facets: await exploreCounts(exploreDeps(() => ctx.sources), parseExploreQuery(new URL(ctx.req.url).searchParams)) }));
