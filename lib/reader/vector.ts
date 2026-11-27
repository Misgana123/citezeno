import type { Queryable } from '@/lib/shelf/db';

/* Search by meaning needs pgvector. It is turned on by the migration when the
   database offers it; when it doesn't, questions use keyword search only and
   nothing else changes.

   Vectors are stored without a fixed size, each with its model and size on its
   paper's text; an HNSW (cosine) index is built per stored size, so changing
   READER_EMBEDDING_DIMENSIONS never alters the table. */

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/* The schema pgvector lives in, or null when it isn't installed. */
export async function vectorSchema(q: Queryable): Promise<string | null> {
  const { rows } = await q.query<{ ns: string }>(`select extnamespace::regnamespace::text as ns from pg_extension where extname = 'vector'`);
  return rows[0]?.ns?.replace(/^"|"$/g, '') ?? null;
}

/* Turn pgvector on (when the database offers it and we may), add the passage
   vector column and the index for this size. Returns whether it is on. */
export async function enableVectors(q: Queryable, dims: number): Promise<boolean> {
  let ns = await vectorSchema(q);
  if (!ns) {
    try {
      await q.query('create extension if not exists vector');
    } catch (e) {
      console.warn('[citezeno] reader: pgvector is not available; questions will use keyword search only.', (e as Error).message);
      return false;
    }
    ns = await vectorSchema(q);
    if (!ns) return false;
  }
  const n = Math.floor(dims);
  await q.query(`alter table reader_passage add column if not exists embedding ${ident(ns)}.vector`);
  // a partial index per size: only vectors of this size, compared as vector(n)
  await q.query(
    `create index if not exists reader_passage_embedding_${n} on reader_passage
       using hnsw ((embedding::${ident(ns)}.vector(${n})) ${ident(ns)}.vector_cosine_ops)
       where ${ident(ns)}.vector_dims(embedding) = ${n}`,
  );
  return true;
}

/* The pieces a query needs to compare vectors of one size: the type cast and the cosine distance operator. */
export function vectorSql(ns: string, dims: number) {
  const n = Math.floor(dims);
  return { cast: `${ident(ns)}.vector(${n})`, distance: `operator(${ident(ns)}.<=>)`, dimsFn: `${ident(ns)}.vector_dims` };
}
