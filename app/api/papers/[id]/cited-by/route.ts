import { json } from '@/lib/http';
import { citedBy } from '@/lib/papers/related/lists';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Papers that cite this paper; takes the same filters, sort and page as search. */
export const GET = paperIdRoute(async ({ client, search }, id) => {
  const { list } = await citedBy(client, id, search({ requireQuery: false }));
  return json(list);
});
