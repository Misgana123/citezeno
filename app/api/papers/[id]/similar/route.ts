import { json } from '@/lib/http';
import { similarTo } from '@/lib/papers/related/lists';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// calls may wait their turn in a service's waiting line and be retried once
export const maxDuration = 60;

/* "More like this": papers close in meaning to this one (one semantic search). */
export const GET = paperIdRoute(async ({ sources, config, search, reserve }, target) => {
  const request = search({ requireQuery: false });
  await reserve(1);
  const { list } = await similarTo(sources, target, request, config.maxQueryChars);
  return json(list);
});
