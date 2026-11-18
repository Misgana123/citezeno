import { timingSafeEqual } from 'node:crypto';
import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { backgroundClient } from '@/lib/shelf/jobs/client';
import { DEFAULT_STEPS, runShelfJobs } from '@/lib/shelf/jobs/runner';
import { fileStore } from '@/lib/shelf/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Called by Vercel Cron every minute (see vercel.json). Vercel sends
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
  const report = await runShelfJobs({ db: pool, client: backgroundClient, store: fileStore() }, 50_000, DEFAULT_STEPS);
  return json({ ok: true, ...report });
}
