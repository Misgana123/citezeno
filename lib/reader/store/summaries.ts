import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '@/lib/shelf/db';

/* Saved summaries: one per paper text (shared, or one user's upload) and one
   per paper from its abstract. Made once, shown instantly after that. */

export type SummaryPoint = { text: string; passageIds: string[] };
export type SummaryContent = { question: SummaryPoint[]; method: SummaryPoint[]; findings: SummaryPoint[]; limits: SummaryPoint[]; keyTerms: { term: string; meaning: string }[] };
export type Summary = { id: string; paperId: string; textId: string | null; basedOn: 'full_text' | 'abstract'; content: SummaryContent; model: string; createdAt: string };

const COLS = `id, "paperId", "textId", "basedOn", content, model, "createdAt"`;
const toS = (r: Record<string, unknown>): Summary => ({ ...(r as unknown as Summary), createdAt: iso(r.createdAt as Date)! });

export async function summaryForText(q: Queryable, textId: string): Promise<Summary | null> {
  const { rows } = await q.query(`select ${COLS} from reader_summary where "textId" = $1`, [textId]);
  return rows[0] ? toS(rows[0]) : null;
}

export async function abstractSummary(q: Queryable, paperId: string): Promise<Summary | null> {
  const { rows } = await q.query(`select ${COLS} from reader_summary where "paperId" = $1 and "basedOn" = 'abstract'`, [paperId]);
  return rows[0] ? toS(rows[0]) : null;
}

/* Save a summary; if another request saved one first, that one is kept and returned. */
export async function saveSummary(q: Queryable, s: Omit<Summary, 'id' | 'createdAt'>): Promise<Summary> {
  const { rows } = await q.query(
    `insert into reader_summary (id, "paperId", "textId", "basedOn", content, model) values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict do nothing returning ${COLS}`,
    [`s_${randomUUID()}`, s.paperId, s.textId, s.basedOn, JSON.stringify(s.content), s.model],
  );
  if (rows[0]) return toS(rows[0]);
  return (s.textId ? await summaryForText(q, s.textId) : await abstractSummary(q, s.paperId))!;
}
