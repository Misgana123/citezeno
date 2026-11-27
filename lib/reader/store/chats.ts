import type { Queryable } from '@/lib/shelf/db';

/* A paper's own conversation: a normal assistant chat with the paper attached
   (so it shows in the sidebar's Chats list). The newest one for the paper. */
export async function paperConversationId(q: Queryable, userId: string, paperId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(`select id from agent_conversation where "userId" = $1 and "paperId" = $2 order by "updatedAt" desc limit 1`, [userId, paperId]);
  return rows[0]?.id ?? null;
}
