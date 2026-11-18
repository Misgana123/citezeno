import type { Queryable } from '../db';
import { ITEM_SELECT, toItem } from '../store/items';
import type { ShelfItem } from '../types';
import { duplicateReason, normalizeTitle, TITLE_THRESHOLD, titleSimilarity, type DupKey } from './similar';

/* Possible duplicates on one user's shelf: pairs of items that look like the
   same paper, minus the pairs the user chose to keep apart ("Keep both"). */

type Row = DupKey & { id: string };
export type DupReason = NonNullable<ReturnType<typeof duplicateReason>>;
export type DupPair = { a: ShelfItem; b: ShelfItem; reason: DupReason };

const MAX_PAIRS = 200;

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

async function rows(q: Queryable, userId: string): Promise<Row[]> {
  const { rows } = await q.query<Row>(
    `select i.id, p.title, p.year, p.doi, p."openalexId" from shelf_item i join shelf_paper p on p.id = i."paperId" where i."userId" = $1`,
    [userId],
  );
  return rows;
}

async function dismissed(q: Queryable, userId: string): Promise<Set<string>> {
  const { rows } = await q.query<{ itemA: string; itemB: string }>(`select "itemA", "itemB" from shelf_not_duplicate where "userId" = $1`, [userId]);
  return new Set(rows.map((r) => pairKey(r.itemA, r.itemB)));
}

/* Every pair, found by DOI / ID first and then by similar titles within each
   year. Titles too different in length to reach the threshold are skipped. */
export function findPairs(all: Row[], skip: Set<string> = new Set(), limit = MAX_PAIRS): { a: string; b: string; reason: DupReason }[] {
  const out: { a: string; b: string; reason: DupReason }[] = [];
  const seen = new Set<string>();
  const add = (a: Row, b: Row) => {
    const k = pairKey(a.id, b.id);
    if (seen.has(k) || skip.has(k) || out.length >= limit) return;
    const reason = duplicateReason(a, b);
    if (!reason) return;
    seen.add(k);
    out.push(a.id < b.id ? { a: a.id, b: b.id, reason } : { a: b.id, b: a.id, reason });
  };

  const byKey = new Map<string, Row[]>();
  for (const r of all) {
    for (const k of [r.doi && `doi:${r.doi}`, r.openalexId && `oa:${r.openalexId}`]) {
      if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
    }
  }
  for (const group of byKey.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) add(group[i], group[j]);

  const byYear = new Map<string, { row: Row; len: number }[]>();
  for (const r of all) {
    const k = String(r.year);
    byYear.set(k, [...(byYear.get(k) ?? []), { row: r, len: normalizeTitle(r.title).length }]);
  }
  const minRatio = TITLE_THRESHOLD / (2 - TITLE_THRESHOLD);
  for (const group of byYear.values()) {
    group.sort((x, y) => x.len - y.len);
    for (let i = 0; i < group.length && out.length < limit; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].len < group[j].len * minRatio) break;
        add(group[i].row, group[j].row);
      }
    }
  }
  return out;
}

/* Items that may be the same paper as this one (just added). */
export async function possibleDuplicatesOf(q: Queryable, userId: string, itemId: string): Promise<ShelfItem[]> {
  const all = await rows(q, userId);
  const me = all.find((r) => r.id === itemId);
  if (!me) return [];
  const skip = await dismissed(q, userId);
  const ids = all.filter((r) => r.id !== itemId && !skip.has(pairKey(r.id, itemId)) && duplicateReason(me, r)).map((r) => r.id);
  if (!ids.length) return [];
  const { rows: items } = await q.query(`${ITEM_SELECT} where i."userId" = $1 and i.id = any($2)`, [userId, ids.slice(0, 10)]);
  return items.map(toItem);
}

export async function duplicatePairs(q: Queryable, userId: string): Promise<DupPair[]> {
  const pairs = findPairs(await rows(q, userId), await dismissed(q, userId));
  if (!pairs.length) return [];
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  const { rows: items } = await q.query(`${ITEM_SELECT} where i."userId" = $1 and i.id = any($2)`, [userId, ids]);
  const byId = new Map(items.map((r) => [r.id as string, toItem(r)]));
  return pairs.filter((p) => byId.has(p.a) && byId.has(p.b)).map((p) => ({ a: byId.get(p.a)!, b: byId.get(p.b)!, reason: p.reason }));
}

export async function countDuplicatePairs(q: Queryable, userId: string): Promise<number> {
  return findPairs(await rows(q, userId), await dismissed(q, userId)).length;
}

/* "Keep both": stop offering this pair. Both items must be the user's. */
export async function keepBoth(q: Queryable, userId: string, x: string, y: string): Promise<boolean> {
  const [a, b] = x < y ? [x, y] : [y, x];
  if (a === b) return false;
  const { rowCount } = await q.query(
    `insert into shelf_not_duplicate ("userId", "itemA", "itemB")
     select $1, $2, $3 where (select count(*) from shelf_item where "userId" = $1 and id in ($2, $3)) = 2
     on conflict do nothing`,
    [userId, a, b],
  );
  return (rowCount ?? 0) > 0 || (await dismissed(q, userId)).has(pairKey(a, b));
}
