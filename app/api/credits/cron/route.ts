import { timingSafeEqual } from 'node:crypto';
import { runCreditJobs } from '@/lib/credits/jobs';
import { billing, wallet } from '@/lib/credits/server';
import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { siteURL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Called by Vercel Cron every five minutes (see vercel.json) with
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
  const report = await runCreditJobs({ db: pool, wallet: wallet(), billing: billing(), siteURL });
  return json({ ok: true, ...report });
}
