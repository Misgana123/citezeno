import { auth } from '@/lib/auth';
import { json } from '@/lib/http';
import { errorResponse, signedOut } from '@/lib/papers/respond';
import { parseSearchRequest } from '@/lib/papers/search/request';
import { runSearch } from '@/lib/papers/search/run';
import { openalex } from '@/lib/papers/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Find Papers main search: ?q=&mode=&sort=&page=&from=&to=&oa=&type=&lang=&abstract=&retracted=&minCites= */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return signedOut();
  try {
    const request = parseSearchRequest(new URL(req.url).searchParams);
    const { list } = await runSearch(openalex(), request);
    return json(list);
  } catch (e) {
    return errorResponse(e);
  }
}
