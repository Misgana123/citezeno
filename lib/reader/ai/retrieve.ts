import type { Queryable } from '@/lib/shelf/db';
import { readerConfig } from '../config';
import type { ReaderDeps } from '../deps';
import { logAiCall } from '../store/ai-log';
import { listPassages, type StoredPassage } from '../store/passages';
import type { TextRow } from '../store/texts';
import { vectorSchema, vectorSql } from '../vector';

/* Finding the passages that answer a question, all inside Postgres:
   - a short paper (under READER_FULLTEXT_MAX_TOKENS) is sent whole
   - a long one: the 30 best keyword matches (full-text search) and the 30
     closest by meaning (pgvector, when the paper's vectors match the current
     embedding model), combined with reciprocal rank fusion; the top 12 go, each
     with its neighbour before and after when they fit, in page order.
   References are never sent. */

export const KEYWORD_K = 30;
export const VECTOR_K = 30;
export const TOP = 12;
/* Tokens of passages one question may send for a long paper. */
const BUDGET = 7000;
const RRF = 60;

export type Retrieved = { passages: StoredPassage[]; mode: 'whole' | 'hybrid' | 'keywords' };

async function keywordIds(q: Queryable, textId: string, question: string): Promise<string[]> {
  // any of the question's words, best matches first (websearch syntax would require them all)
  const words = (question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 24);
  if (!words.length) return [];
  const { rows } = await q.query<{ id: string }>(
    `select id from reader_passage, to_tsquery('english', $2) query
     where "textId" = $1 and not "isReferences" and tsv @@ query
     order by ts_rank_cd(tsv, query) desc, ord limit ${KEYWORD_K}`,
    [textId, words.map((w) => w.replace(/'/g, '')).join(' | ')],
  );
  return rows.map((r) => r.id);
}

async function vectorIds(deps: ReaderDeps, text: TextRow, question: string, who: { userId: string | null }): Promise<string[] | null> {
  const embedder = deps.embedder();
  if (!embedder || text.embeddingModel !== embedder.model.id || text.embeddingDims !== embedder.dimensions) return null;
  const ns = await vectorSchema(deps.db);
  if (!ns) return null;
  try {
    const { vectors, tokens, costUsd } = await embedder.embed('query', [{ text: question }]);
    await logAiCall(deps.db, { userId: who.userId, paperId: text.paperId, action: 'embed', model: embedder.model.id, inputTokens: tokens, outputTokens: 0, costUsd });
    const v = vectorSql(ns, embedder.dimensions);
    const { rows } = await deps.db.query<{ id: string }>(
      `select id from reader_passage
       where "textId" = $1 and not "isReferences" and embedding is not null and ${v.dimsFn}(embedding) = ${embedder.dimensions}
       order by embedding::${v.cast} ${v.distance} $2::${v.cast} limit ${VECTOR_K}`,
      [text.id, `[${vectors[0].join(',')}]`],
    );
    return rows.map((r) => r.id);
  } catch (e) {
    // embeddings down or capped: keyword search still answers
    console.warn('[citezeno] reader: search by meaning failed, using keywords', (e as Error)?.message);
    return null;
  }
}

/* Reciprocal rank fusion: a passage high on either list ranks high. */
export function fuse(lists: string[][], k = RRF): string[] {
  const score = new Map<string, number>();
  for (const list of lists) list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...score].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/* The top passages plus their neighbours, within the budget, in paper order. */
export function withNeighbours(all: StoredPassage[], top: string[], budget = BUDGET): StoredPassage[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const byOrd = new Map(all.map((p) => [p.ord, p]));
  const chosen = new Map<string, StoredPassage>();
  let used = 0;
  const add = (p: StoredPassage | undefined) => {
    if (!p || p.isReferences || chosen.has(p.id) || used + p.tokens > budget) return false;
    chosen.set(p.id, p);
    used += p.tokens;
    return true;
  };
  for (const id of top) add(byId.get(id));
  for (const id of top) {
    const p = byId.get(id);
    if (!p) continue;
    add(byOrd.get(p.ord - 1));
    add(byOrd.get(p.ord + 1));
  }
  return [...chosen.values()].sort((a, b) => a.ord - b.ord);
}

export async function retrieve(deps: ReaderDeps, text: TextRow, question: string, who: { userId: string | null }): Promise<Retrieved> {
  const all = await listPassages(deps.db, text.id);
  const body = all.filter((p) => !p.isReferences);
  if ((text.tokenCount ?? Infinity) <= readerConfig().fullTextMaxTokens) return { passages: body, mode: 'whole' };
  const [kw, vec] = await Promise.all([keywordIds(deps.db, text.id, question), vectorIds(deps, text, question, who)]);
  const ranked = fuse(vec ? [vec, kw] : [kw]).slice(0, TOP);
  // nothing matched the words: fall back to the start of the paper (the abstract and introduction)
  const top = ranked.length ? ranked : body.slice(0, 4).map((p) => p.id);
  return { passages: withNeighbours(all, top), mode: vec ? 'hybrid' : 'keywords' };
}
