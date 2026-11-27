import { json } from '@/lib/http';
import { papersRoute } from '@/lib/papers/route';
import { runSearch, searchesFor } from '@/lib/papers/search/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// calls may wait their turn in a service's waiting line and be retried once
export const maxDuration = 60;

/* Find Papers main search: ?q=&mode=&sort=&page=&from=&to=&oa=&type=&lang=&abstract=&retracted=&minCites= */
export const GET = papersRoute(async ({ sources, search, reserve }) => {
  const request = search();
  await reserve(searchesFor(request.mode));
  const { list } = await runSearch(sources, request);
  return json(list);
});
