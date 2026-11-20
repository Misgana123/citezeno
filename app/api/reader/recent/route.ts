import { json } from '@/lib/http';
import { readerRoute } from '@/lib/reader/route';
import { recentPositions } from '@/lib/reader/store/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* "Continue reading": the papers the user opened last, with the page reached. */
export const GET = readerRoute(async ({ userId, deps }) => json({ papers: await recentPositions(deps.db, userId, 6) }));
