import { json } from '@/lib/http';
import { similarTo } from '@/lib/papers/related/lists';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* "More like this": papers close in meaning to this one. */
export const GET = paperIdRoute(async ({ client, config, search }, id) => {
  const { list } = await similarTo(client, id, search({ requireQuery: false }), config.maxQueryChars);
  return json(list);
});
