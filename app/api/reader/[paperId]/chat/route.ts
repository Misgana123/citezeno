import { json } from '@/lib/http';
import { paperChat, SUGGESTED_QUESTIONS } from '@/lib/reader/ai/ask';
import { readerRoute } from '@/lib/reader/route';
import { loadPaper } from '@/lib/reader/service/paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

/* The paper's conversation (or ?chat=<id>, one of the user's chats continued here). */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { paper } = await loadPaper(deps, userId, paperId);
  const chat = new URL(req.url).searchParams.get('chat')?.slice(0, 80) || null;
  return json({ ...(await paperChat(deps, userId, paper.id, chat)), suggestions: SUGGESTED_QUESTIONS });
});
