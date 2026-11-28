import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { cancelInvite } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = labRoute<{ id: string }>(async ({ deps, user }, { id }) => {
  await cancelInvite(deps, user.id, id);
  return json({ cancelled: true });
});
