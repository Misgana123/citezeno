import { randomUUID } from 'node:crypto';
import type { PageBox } from '@/lib/providers/pdf-text/types';
import { iso, type Queryable } from '@/lib/shelf/db';

/* Highlights (with an optional note) and page notes: always private to the
   user who made them. Every query is scoped to that user. */

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type Highlight = {
  id: string;
  paperId: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PageBox[];
  color: HighlightColor;
  note: string | null;
  pdfKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageNote = { id: string; paperId: string; page: number; x: number; y: number; text: string; createdAt: string; updatedAt: string };

const H_COLS = `id, "paperId", page, quote, prefix, suffix, rects, color, note, "pdfKey", "createdAt", "updatedAt"`;
const N_COLS = `id, "paperId", page, x, y, text, "createdAt", "updatedAt"`;

const toH = (r: Record<string, unknown>): Highlight => ({ ...(r as unknown as Highlight), createdAt: iso(r.createdAt as Date)!, updatedAt: iso(r.updatedAt as Date)! });
const toN = (r: Record<string, unknown>): PageNote => ({ ...(r as unknown as PageNote), createdAt: iso(r.createdAt as Date)!, updatedAt: iso(r.updatedAt as Date)! });

export async function listHighlights(q: Queryable, userId: string, paperId: string): Promise<Highlight[]> {
  const { rows } = await q.query(`select ${H_COLS} from reader_highlight where "userId" = $1 and "paperId" = $2 order by page, (rects->0->>'y')::float, "createdAt"`, [userId, paperId]);
  return rows.map(toH);
}

export async function listPageNotes(q: Queryable, userId: string, paperId: string): Promise<PageNote[]> {
  const { rows } = await q.query(`select ${N_COLS} from reader_page_note where "userId" = $1 and "paperId" = $2 order by page, y, "createdAt"`, [userId, paperId]);
  return rows.map(toN);
}

export async function addHighlight(q: Queryable, userId: string, h: Omit<Highlight, 'id' | 'createdAt' | 'updatedAt'>): Promise<Highlight> {
  const { rows } = await q.query(
    `insert into reader_highlight (id, "userId", "paperId", page, quote, prefix, suffix, rects, color, note, "pdfKey")
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) returning ${H_COLS}`,
    [`h_${randomUUID()}`, userId, h.paperId, h.page, h.quote, h.prefix, h.suffix, JSON.stringify(h.rects), h.color, h.note, h.pdfKey],
  );
  return toH(rows[0]);
}

export type HighlightPatch = { color?: HighlightColor; note?: string | null; page?: number; rects?: PageBox[]; pdfKey?: string | null };

export async function updateHighlight(q: Queryable, userId: string, id: string, patch: HighlightPatch): Promise<Highlight | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, id];
  const set = (col: string, v: unknown, cast = '') => {
    values.push(v);
    sets.push(`${col} = $${values.length}${cast}`);
  };
  if (patch.color !== undefined) set('color', patch.color);
  if (patch.note !== undefined) set('note', patch.note);
  if (patch.page !== undefined) set('page', patch.page);
  if (patch.rects !== undefined) set('rects', JSON.stringify(patch.rects), '::jsonb');
  if (patch.pdfKey !== undefined) set('"pdfKey"', patch.pdfKey);
  const sql = sets.length
    ? `update reader_highlight set ${sets.join(', ')}, "updatedAt" = now() where "userId" = $1 and id = $2 returning ${H_COLS}`
    : `select ${H_COLS} from reader_highlight where "userId" = $1 and id = $2`;
  const { rows } = await q.query(sql, values);
  return rows[0] ? toH(rows[0]) : null;
}

export async function removeHighlight(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from reader_highlight where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

export async function addPageNote(q: Queryable, userId: string, n: Omit<PageNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<PageNote> {
  const { rows } = await q.query(`insert into reader_page_note (id, "userId", "paperId", page, x, y, text) values ($1, $2, $3, $4, $5, $6, $7) returning ${N_COLS}`, [
    `n_${randomUUID()}`,
    userId,
    n.paperId,
    n.page,
    n.x,
    n.y,
    n.text,
  ]);
  return toN(rows[0]);
}

export async function updatePageNote(q: Queryable, userId: string, id: string, patch: { text?: string; x?: number; y?: number }): Promise<PageNote | null> {
  const { rows } = await q.query(
    `update reader_page_note set text = coalesce($3, text), x = coalesce($4, x), y = coalesce($5, y), "updatedAt" = now() where "userId" = $1 and id = $2 returning ${N_COLS}`,
    [userId, id, patch.text ?? null, patch.x ?? null, patch.y ?? null],
  );
  return rows[0] ? toN(rows[0]) : null;
}

export async function removePageNote(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from reader_page_note where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}
