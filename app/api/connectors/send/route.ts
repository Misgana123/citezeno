import { z } from 'zod';
import { json } from '@/lib/http';
import { connectorErrorResponse } from '@/lib/connectors/route';
import { capabilityOpener } from '@/lib/connectors/access';
import { connectorDeps } from '@/lib/connectors/server';
import { SEND_MAX, sendShelf } from '@/lib/connectors/service/send-shelf';
import { shelfRows } from '@/lib/connectors/service/shelf-rows';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { shelfRoute } from '@/lib/shelf/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const target = z.discriminatedUnion('to', [
  z.object({ to: z.literal('sheets'), title: z.string().trim().max(200).default('') }),
  z.object({ to: z.literal('pages'), databaseId: z.string().trim().min(32).max(300) }),
  z.object({ to: z.literal('references'), libraryId: z.string().regex(/^(user|group:\d{1,12})$/), collectionKey: z.string().regex(/^[A-Z0-9]{8}$/).nullish(), newCollection: z.string().trim().max(200).nullish() }),
]);
const body = z.object({
  /* the shelf listing's query string (filters), as the page sends it to /api/shelf/papers */
  query: z.string().max(4000).default(''),
  itemIds: z.array(z.string().min(1).max(80)).max(SEND_MAX).optional(),
  target,
});

/* Send shelf papers (the chosen ones, or every paper the filters show) to a connected app. */
export const POST = shelfRoute(async (ctx) => {
  const b = await ctx.body(body);
  try {
    const base = new URLSearchParams(b.query);
    if (b.itemIds?.length) base.set('ids', b.itemIds.join(','));
    const { rows, total } = await shelfRows(
      ctx.db,
      ctx.userId,
      (page, perPage) => {
        const qs = new URLSearchParams(base);
        qs.set('page', String(page));
        qs.set('perPage', String(perPage));
        return parseListRequest(qs);
      },
      SEND_MAX,
    );
    const out = await sendShelf(capabilityOpener(connectorDeps(), ctx.userId), rows, b.target);
    return json({ ...out, leftOut: Math.max(0, total - rows.length) });
  } catch (e) {
    return connectorErrorResponse(e);
  }
});
