import type { Queryable } from '@/lib/shelf/db';
import { listItems } from '@/lib/shelf/store/items';
import { recentPositions } from '@/lib/reader/store/positions';

/* The search dialog: one user's chats (titles and what was said), the papers
   on their shelf (the shelf's own full-text search) and their citation studio
   drafts. With no words, the most recent of each. Everything is scoped to the
   user. */

export const SEARCH_TYPES = ['all', 'chats', 'papers', 'drafts'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/* paperId: a paper's own conversation (it opens in the reader) */
export type ChatHit = { id: string; title: string; at: string; snippet: string | null; paperId?: string | null };
export type PaperHit = { itemId: string; paperId: string; title: string; authors: string; year: number | null; retracted: boolean; at: string };
/* A paper the user opened in the reader, and the page they reached. */
export type ReadingHit = { paperId: string; title: string; page: number; pageCount: number | null; at: string };
export type DraftHit = { id: string; title: string; at: string; snippet: string | null };
export type SearchResult = { chats: ChatHit[]; papers: PaperHit[]; drafts: DraftHit[]; reading?: ReadingHit[] };

/* Words for ILIKE, with % and _ taken literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/* A short piece of text around the first place the words appear. */
export function snippetAround(text: string | null, q: string, width = 90): string | null {
  if (!text) return null;
  // plain words: no markdown marks or [n] citations
  const flat = text
    .replace(/\[(\d{1,3})\](?!\()/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const at = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : 0;
  if (at < 0) return null;
  const start = Math.max(0, at - 30);
  const piece = flat.slice(start, start + width);
  return `${start > 0 ? '…' : ''}${piece}${start + width < flat.length ? '…' : ''}`;
}

async function chats(db: Queryable, userId: string, q: string, limit: number): Promise<ChatHit[]> {
  const { rows } = q
    ? await db.query<{ id: string; title: string; updatedAt: Date; hit: string | null; paperId: string | null }>(
        `select c.id, c.title, c."updatedAt", c."paperId",
           (select m.content->>'text' from agent_message m
             where m."conversationId" = c.id and m.role in ('user', 'assistant') and m.content->>'text' ilike $2
             order by m.seq limit 1) as hit
         from agent_conversation c
         where c."userId" = $1 and (c.title ilike $2 or exists (
           select 1 from agent_message m where m."conversationId" = c.id and m.role in ('user', 'assistant') and m.content->>'text' ilike $2))
         order by c."updatedAt" desc limit $3`,
        [userId, like(q), limit],
      )
    : await db.query<{ id: string; title: string; updatedAt: Date; hit: null; paperId: string | null }>(
        `select id, title, "updatedAt", "paperId", null as hit from agent_conversation where "userId" = $1 order by "updatedAt" desc limit $2`,
        [userId, limit],
      );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    at: new Date(r.updatedAt).toISOString(),
    snippet: q && !r.title.toLowerCase().includes(q.toLowerCase()) ? snippetAround(r.hit, q) : null,
    ...(r.paperId ? { paperId: r.paperId } : {}),
  }));
}

async function papers(db: Queryable, userId: string, q: string, limit: number): Promise<PaperHit[]> {
  const page = await listItems(db, userId, { q: q || undefined, sort: q ? 'relevance' : 'added_desc', page: 1, perPage: limit });
  return page.items.map((i) => {
    const names = i.paper.authors.map((a) => a.name);
    return {
      itemId: i.id,
      paperId: i.paper.id,
      title: i.paper.title,
      authors: names.length > 2 ? `${names.slice(0, 2).join(', ')} et al.` : names.join(', '),
      year: i.paper.year,
      retracted: i.paper.isRetracted,
      at: i.addedAt,
    };
  });
}

async function drafts(db: Queryable, userId: string, q: string, limit: number): Promise<DraftHit[]> {
  const { rows } = await db.query<{ id: string; title: string; snippet: string | null; savedAt: Date }>(
    q
      ? `select id, title, snippet, "savedAt" from trace where "userId" = $1 and (title ilike $2 or snippet ilike $2) order by "savedAt" desc limit $3`
      : `select id, title, snippet, "savedAt" from trace where "userId" = $1 order by "savedAt" desc limit $2`,
    q ? [userId, like(q), limit] : [userId, limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.title || 'Untitled draft', at: new Date(r.savedAt).toISOString(), snippet: q ? snippetAround(r.snippet, q) : null }));
}

async function reading(db: Queryable, userId: string, q: string, limit: number): Promise<ReadingHit[]> {
  const opened = await recentPositions(db, userId, q ? 50 : limit);
  const words = q.toLowerCase().split(' ').filter(Boolean);
  return opened
    .filter((o) => words.every((w) => o.title.toLowerCase().includes(w)))
    .slice(0, limit)
    .map((o) => ({ paperId: o.paperId, title: o.title, page: o.page, pageCount: o.pageCount, at: o.updatedAt }));
}

export async function search(db: Queryable, userId: string, rawQ: string, type: SearchType): Promise<SearchResult> {
  const q = rawQ.replace(/\s+/g, ' ').trim().slice(0, 200);
  const limit = type === 'all' ? (q ? 6 : 5) : 20;
  const want = (t: SearchType) => type === 'all' || type === t;
  const [c, p, d, r] = await Promise.all([
    want('chats') ? chats(db, userId, q, type === 'all' && !q ? 8 : limit) : [],
    want('papers') ? papers(db, userId, q, limit) : [],
    want('drafts') ? drafts(db, userId, q, limit) : [],
    // "Continue reading": the papers opened last in the reader
    want('papers') ? reading(db, userId, q, type === 'all' ? 3 : 8) : [],
  ]);
  return { chats: c, papers: p, drafts: d, reading: r };
}
