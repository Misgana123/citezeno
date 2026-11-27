import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { feedbackBody, readBody } from '@/lib/agent/bodies';
import { AgentHttpError, agentRoute } from '@/lib/agent/server';
import { setFeedback } from '@/lib/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Thumbs up or down on one of the user's answers (null takes it back). */
export const PATCH = agentRoute<{ id: string; seq: string }>(async (req, userId, { id, seq }) => {
  const n = Number(seq);
  if (!Number.isInteger(n) || n < 1) throw new AgentHttpError(404, 'That message no longer exists.', 'not_found');
  const { feedback } = await readBody(req, feedbackBody);
  if (!(await setFeedback(pool, userId, id, n, feedback))) throw new AgentHttpError(404, 'That message no longer exists.', 'not_found');
  return json({ ok: true });
});
