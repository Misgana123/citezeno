import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { READER_SQL } from '@/lib/reader/schema';
import { enableVectors, vectorSchema, vectorSql } from '@/lib/reader/vector';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe.skipIf(!TEST_DB_URL)('reader tables', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  });
  afterAll(async () => db?.close());

  it('can be created again without changes', async () => {
    await db.pool.query(READER_SQL);
    await db.pool.query(READER_SQL);
  });

  it('keeps one shared text per paper, and deletes an upload’s text with the upload', async () => {
    const u = await db.addUser();
    await db.pool.query(`insert into reader_text (id, "paperId", scope) values ('t1', 'openalex:W1', 'shared')`);
    await expect(db.pool.query(`insert into reader_text (id, "paperId", scope) values ('t2', 'openalex:W1', 'shared')`)).rejects.toThrow();
    // a shared text has no owner; a user's text needs its upload
    await expect(db.pool.query(`insert into reader_text (id, "paperId", scope, "ownerId") values ('t3', 'openalex:W2', 'shared', $1)`, [u])).rejects.toThrow();
    await db.pool.query(`insert into shelf_pdf (id, "userId", "storageKey", "fileName") values ('f1', $1, 'k1', 'a.pdf')`, [u]);
    await db.pool.query(`insert into reader_text (id, "paperId", scope, "ownerId", "pdfId") values ('t4', 'openalex:W1', 'user', $1, 'f1')`, [u]);
    await db.pool.query(`insert into reader_passage ("textId", id, ord, page, text, box) values ('t4', 'p1-1', 0, 1, 'Nurses in three hospitals', '{}')`);
    await db.pool.query(`insert into reader_summary (id, "paperId", "textId", "basedOn", content, model) values ('s1', 'openalex:W1', 't4', 'full_text', '{}', 'm')`);
    await db.pool.query(`delete from shelf_pdf where id = 'f1'`);
    const left = await db.pool.query(`select (select count(*) from reader_text where id = 't4')::int t, (select count(*) from reader_passage where "textId" = 't4')::int p, (select count(*) from reader_summary where id = 's1')::int s`);
    expect(left.rows[0]).toEqual({ t: 0, p: 0, s: 0 });
  });

  it('finds passages by keywords', async () => {
    await db.pool.query(`insert into reader_passage ("textId", id, ord, page, section, text, box) values ('t1', 'p2-1', 1, 2, 'Methods', 'We surveyed 1,200 nurses in three hospitals.', '{}'), ('t1', 'p3-1', 2, 3, 'Results', 'Burnout fell after the change.', '{}')`);
    const { rows } = await db.pool.query(`select id from reader_passage where "textId" = 't1' and tsv @@ websearch_to_tsquery('english', 'nurse survey')`);
    expect(rows.map((r) => r.id)).toEqual(['p2-1']);
  });

  it('turns on vectors when pgvector is there, and searches by cosine distance', async () => {
    if (!(await enableVectors(db.pool, 3))) return; // no pgvector on this database: keyword search only
    expect(await enableVectors(db.pool, 3)).toBe(true); // again: no change
    const ns = (await vectorSchema(db.pool))!;
    const v = vectorSql(ns, 3);
    await db.pool.query(`update reader_passage set embedding = $1::${v.cast} where id = 'p2-1'`, ['[1,0,0]']);
    await db.pool.query(`update reader_passage set embedding = $1::${v.cast} where id = 'p3-1'`, ['[0,1,0]']);
    const { rows } = await db.pool.query(
      `select id from reader_passage where "textId" = 't1' and embedding is not null and ${v.dimsFn}(embedding) = 3
       order by embedding::${v.cast} ${v.distance} $1::${v.cast} limit 1`,
      ['[0.1,0.9,0]'],
    );
    expect(rows[0].id).toBe('p3-1');
  });
});
