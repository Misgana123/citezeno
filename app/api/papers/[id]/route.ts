import { json } from '@/lib/http';
import { getPaper } from '@/lib/papers/related/paper';
import { paperIdRoute } from '@/lib/papers/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Full details for one paper. */
export const GET = paperIdRoute(async ({ papers }, id) => {
  const { paper } = await getPaper(papers, id);
  return json(paper);
});
