import { headers } from 'next/headers';
import { accountOverview } from '@/lib/account/overview';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* What the Settings dialog shows about the signed-in user's account. */
export async function GET() {
  const overview = await accountOverview(await headers());
  if (!overview) return json({ error: 'Sign in first.', code: 'signed_out' }, 401);
  return json(overview);
}
