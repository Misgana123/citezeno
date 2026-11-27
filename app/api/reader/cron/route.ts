import { timingSafeEqual } from 'node:crypto';
import { json } from '@/lib/http';
import { readerConfig } from '@/lib/reader/config';
import { runReaderJobs } from '@/lib/reader/jobs/runner';
import { readerDeps } from '@/lib/reader/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Called by Vercel Cron every minute (see vercel.json) with
   "Authorization: Bearer $CRON_SECRET"; without the secret nothing runs. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: 'Not allowed.' }, 401);
  const report = await runReaderJobs(readerDeps(), 50_000, { sharedKeepDays: readerConfig().sharedKeepDays });
  return json({ ok: true, ...report });
}
