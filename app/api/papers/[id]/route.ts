import { json } from '@/lib/http';
import { getPaper } from '@/lib/papers/related/paper';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// calls may wait their turn in a service's waiting line and be retried once
export const maxDuration = 60;

/* Full details for one paper. */
export const GET = paperIdRoute(async (_ctx, target) => {
  const { paper } = await getPaper(target);
  return json(paper);
});
