import { json } from '@/lib/http';
import { exploreList } from '@/lib/papers/explore/feed';
import { parseExploreQuery } from '@/lib/papers/explore/query';
import { papersRoute } from '@/lib/papers/route';
import { exploreDeps } from '@/lib/papers/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* The Explore feed: ?subject=&sort=&type=&source=&from=&to=&oa=&pdf=&abstract=&minCites=&lang=&page=
   From our own copy of papers, so it uses none of the user's daily searches. */
export const GET = papersRoute(async (ctx) => json(await exploreList(exploreDeps(() => ctx.sources), parseExploreQuery(new URL(ctx.req.url).searchParams))));
