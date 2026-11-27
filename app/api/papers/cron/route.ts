import { timingSafeEqual } from 'node:crypto';
import { json } from '@/lib/http';
import { RUN_BUDGET_MS, runCopyJobs } from '@/lib/papers/local/jobs/runner';
import { copyJobDeps } from '@/lib/papers/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Called by Vercel Cron every 15 minutes (see vercel.json) with
   "Authorization: Bearer $CRON_SECRET"; without the secret nothing runs. Keeps
   our own copy of papers filled and up to date (only with PAPERS_LOCAL_COPY on;
   otherwise it returns at once without touching the database). */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: 'Not allowed.' }, 401);
  const report = await runCopyJobs(copyJobDeps(), RUN_BUDGET_MS);
  return json({ ok: true, ...report });
}
