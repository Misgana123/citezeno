import { json } from '@/lib/http';
import { referencesOf } from '@/lib/papers/related/lists';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Papers this paper cites; takes the same filters, sort and page as search. */
export const GET = paperIdRoute(async ({ search }, target) => {
  const { list } = await referencesOf(target, search({ requireQuery: false }));
  return json(list);
});
