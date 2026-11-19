import { json } from '@/lib/http';
import { papersRoute } from '@/lib/papers/route';
import { runSearch, searchesFor } from '@/lib/papers/search/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Find Papers main search: ?q=&mode=&sort=&page=&from=&to=&oa=&type=&lang=&abstract=&retracted=&minCites= */
export const GET = papersRoute(async ({ sources, search, reserve }) => {
  const request = search();
  await reserve(searchesFor(request.mode));
  const { list } = await runSearch(sources, request);
  return json(list);
});
