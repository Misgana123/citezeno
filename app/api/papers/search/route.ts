import { json } from '@/lib/http';
import { papersRoute } from '@/lib/papers/route';
import { runSearch } from '@/lib/papers/search/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Find Papers main search: ?q=&mode=&sort=&page=&from=&to=&oa=&type=&lang=&abstract=&retracted=&minCites= */
export const GET = papersRoute(async ({ client, search }) => {
  const { list } = await runSearch(client, search());
  return json(list);
});
