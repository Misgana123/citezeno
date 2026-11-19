import { json } from '@/lib/http';
import { similarTo } from '@/lib/papers/related/lists';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* "More like this": papers close in meaning to this one (one semantic search). */
export const GET = paperIdRoute(async ({ sources, config, search, reserve }, id) => {
  const request = search({ requireQuery: false });
  await reserve(1);
  const { list } = await similarTo(sources, id, request, config.maxQueryChars);
  return json(list);
});
