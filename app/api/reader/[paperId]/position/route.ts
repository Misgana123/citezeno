import { z } from 'zod';
import { json } from '@/lib/http';
import { readerRoute } from '@/lib/reader/route';
import { readPaperId } from '@/lib/reader/service/paper';
import { savePosition } from '@/lib/reader/store/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

const body = z.object({ page: z.number().int().min(1).max(100_000), pageCount: z.number().int().min(1).max(100_000).nullable().optional() });

/* Remember the last page read (private to the user). */
export const PATCH = readerRoute<P>(async ({ userId, deps, body: read }, { paperId }) => {
  const { page, pageCount } = await read(body);
  await savePosition(deps.db, userId, readPaperId(paperId), page, pageCount ?? null);
  return json({ ok: true });
});
