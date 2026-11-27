import type { PageBox } from '@/lib/providers/pdf-text/types';
import type { Queryable } from '@/lib/shelf/db';

/* A text's passages, as the reader and the AI use them. */

export type StoredPassage = {
  id: string;
  ord: number;
  page: number;
  section: string | null;
  isReferences: boolean;
  text: string;
  tokens: number;
  box: PageBox & { endPage?: number };
};

const COLS = `id, ord, page, section, "isReferences", text, tokens, box`;

export async function listPassages(q: Queryable, textId: string): Promise<StoredPassage[]> {
  const { rows } = await q.query(`select ${COLS} from reader_passage where "textId" = $1 order by ord`, [textId]);
  return rows as StoredPassage[];
}

/* Passages still without a vector (references are never searched, so never embedded). */
export async function passagesToEmbed(q: Queryable, textId: string, limit: number): Promise<StoredPassage[]> {
  const { rows } = await q.query(`select ${COLS} from reader_passage where "textId" = $1 and not "isReferences" and embedding is null order by ord limit $2`, [textId, limit]);
  return rows as StoredPassage[];
}

/* Store vectors (as pgvector text, '[0.1,0.2,…]') for passages of one text. */
export async function setEmbeddings(q: Queryable, textId: string, cast: string, items: { id: string; vector: number[] }[]): Promise<void> {
  if (!items.length) return;
  const values: unknown[] = [textId];
  const rows = items.map((it, i) => {
    values.push(it.id, `[${it.vector.join(',')}]`);
    return `($${i * 2 + 2}, $${i * 2 + 3})`;
  });
  await q.query(
    `update reader_passage p set embedding = v.vec::${cast} from (values ${rows.join(', ')}) as v(id, vec) where p."textId" = $1 and p.id = v.id`,
    values,
  );
}
