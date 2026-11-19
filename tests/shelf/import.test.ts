import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { QueryParams } from '@/lib/providers/openalex/client';
import { openAlexOver } from '../papers/fake-openalex';
import { shelfConfig } from '@/lib/shelf/config';
import { parseBibtex } from '@/lib/shelf/import/bibtex';
import { parseReferenceFile } from '@/lib/shelf/import/parse';
import { parseRis } from '@/lib/shelf/import/ris';
import { latexToText, personName } from '@/lib/shelf/import/text';
import { DEFAULT_STEPS, runShelfJobs } from '@/lib/shelf/jobs/runner';
import { lookupDois } from '@/lib/shelf/lookup/batch';
import { runImportSlice } from '@/lib/shelf/service/import-run';
import { startImport } from '@/lib/shelf/service/import-start';
import { memoryStore } from '@/lib/providers/storage/memory';
import { getImport } from '@/lib/shelf/store/imports';
import { listItems } from '@/lib/shelf/store/items';
import { listProjects } from '@/lib/shelf/store/projects';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

const BIB = String.raw`
@string{jnl = "Journal of {R}ivers"}
@comment{ignored @article{nope, title={x}} }
@article{smith2020,
  title = {The {Effect} of Floods on {\"O}sterreich's Rivers},
  author = {Smith, John and M{\"u}ller, Anna and others},
  journal = jnl # " and Lakes",
  year = 2020, month = mar,
  doi = {https://doi.org/10.1234/RIVERS.1},
  url = {https://example.org/rivers},
  abstract = {We studied floods -- a lot.}
}
@inproceedings(conf21, title = "A conference paper", author = "Jane Roe", booktitle = {Proc. of Things}, year = {2021})
@book{nobody, author = {No Title}, year = 1999}
@phdthesis{t, title={A Thesis}, author={Doe, J.}, school={Uni}, year={2018}}
`;

const RIS = `TY  - JOUR
TI  - Rivers and floods in a long title that
  wraps onto a second line
AU  - Smith, John
AU  - Müller, Anna
PY  - 2020///
T2  - Journal of Rivers
DO  - 10.1234/rivers.1
UR  - https://example.org/rivers
AB  - An abstract.
ER  -

TY  - BOOK
AU  - Nobody
ER  -

TY  - CHAP
T1  - A chapter
A1  - Roe, Jane
Y1  - 2019
UR  - https://doi.org/10.5555/chapter.2
ER  -
`;

describe('reading reference files', () => {
  it('reads BibTeX: macros, concatenation, accents, nested braces, months and authors', () => {
    const r = parseBibtex(BIB);
    expect(r.failed).toEqual([{ label: 'nobody', reason: 'No title' }]);
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0]).toEqual({
      label: 'smith2020',
      title: 'The Effect of Floods on Österreich\'s Rivers',
      authors: ['John Smith', 'Anna Müller'],
      year: 2020,
      source: 'Journal of Rivers and Lakes',
      doi: '10.1234/rivers.1',
      url: 'https://example.org/rivers',
      type: 'article',
      abstract: 'We studied floods – a lot.',
    });
    expect(r.entries[1]).toMatchObject({ label: 'conf21', title: 'A conference paper', authors: ['Jane Roe'], source: 'Proc. of Things', year: 2021 });
    expect(r.entries[2]).toMatchObject({ type: 'dissertation', source: 'Uni', authors: ['J. Doe'] });
  });

  it('reads RIS: wrapped lines, several authors, DOIs from DO or a doi.org link', () => {
    const r = parseRis(RIS);
    expect(r.failed).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ title: 'Rivers and floods in a long title that wraps onto a second line', authors: ['John Smith', 'Anna Müller'], year: 2020, source: 'Journal of Rivers', doi: '10.1234/rivers.1', type: 'article' });
    expect(r.entries[1]).toMatchObject({ title: 'A chapter', authors: ['Jane Roe'], doi: '10.5555/chapter.2', type: 'book-chapter' });
  });

  it('detects the format and cleans names and LaTeX', () => {
    expect(parseReferenceFile('refs.txt', RIS)?.format).toBe('ris');
    expect(parseReferenceFile('refs.txt', BIB)?.format).toBe('bibtex');
    expect(parseReferenceFile('notes.txt', 'just some text')).toBeNull();
    expect(latexToText('Caf{\\\'e} \\& Na\\"{\\i}ve --- {T}est~one')).toBe('Café & Naïve — Test one');
    expect(personName('van Beethoven, Jr., Ludwig')).toBe('Ludwig van Beethoven Jr.');
  });
});

const work = (n: number, doi: string) => ({ id: `https://openalex.org/W${n}`, display_name: `Found ${n}`, doi: `https://doi.org/${doi}`, authorships: [] });

function fakeClient(impl?: (path: string, params: QueryParams) => unknown) {
  const get = vi.fn(async (path: string, params: QueryParams = {}) => {
    const body = impl
      ? impl(path, params)
      : { results: String(params.filter ?? '').replace(/^doi:/, '').split('|').filter((d) => d.startsWith('10.1234/')).map((d, i) => work(7000 + Number(d.split('.').pop()) || i, d)) };
    if (body instanceof Error) throw body;
    return { body, costUsd: 0.0001, status: 200 };
  });
  return { client: openAlexOver(get as never), get };
}

describe('batched DOI lookups', () => {
  it('asks for 50 DOIs per call and looks up awkward DOIs one by one', async () => {
    const { client, get } = fakeClient((path, params) => (path === '/works' ? { results: [] } : work(1, '10.1/a,b')));
    const dois = Array.from({ length: 120 }, (_, i) => `10.1234/x.${i}`).concat('10.1111/a,b');
    await lookupDois(client, dois);
    expect(get.mock.calls.filter(([p]) => p === '/works')).toHaveLength(3);
    expect(get.mock.calls.filter(([p]) => p.startsWith('/works/doi:'))).toHaveLength(1);
  });
});

describe.skipIf(!TEST_DB_URL)('importing (Postgres)', () => {
  let db: TestDb;
  let user: string;
  const config = { ...shelfConfig({}), importMaxEntries: 500 };
  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
  });
  afterAll(async () => db?.close());

  const bib = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => `@article{k${i + offset}, title={Paper number ${i + offset} about many things}, year={2020}${(i + offset) % 2 ? '' : `, doi={10.1234/x.${i + offset}}`}}`).join('\n');

  it('refuses files that are too big, not references, or empty', async () => {
    await expect(startImport(db.pool, { ...config, importMaxBytes: 10 }, user, { fileName: 'a.bib', text: bib(3) })).rejects.toMatchObject({ code: 'too_large' });
    await expect(startImport(db.pool, config, user, { fileName: 'a.docx', text: 'hello' })).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(startImport(db.pool, config, user, { fileName: 'a.bib', text: '% nothing here' })).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(startImport(db.pool, config, user, { fileName: 'a.bib', text: bib(501) })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('works through a large import in batches, matching DOIs and keeping the rest as written', async () => {
    const { client, get } = fakeClient();
    const id = await startImport(db.pool, config, user, { fileName: 'big.bib', text: bib(120) + '\n@misc{bad, author={X}}', newProject: 'Imported' });
    expect((await getImport(db.pool, user, id))?.counts).toMatchObject({ pending: 120, failed: 1 });

    expect(await runImportSlice({ db: db.pool, papers: client }, { id, budgetMs: 60_000 })).toBe('done');
    const s = await getImport(db.pool, user, id);
    expect(s).toMatchObject({ status: 'done', total: 121, counts: { pending: 0, matched: 60, added: 60, duplicate: 0, failed: 1 }, failed: [{ label: 'bad', reason: 'No title' }] });
    expect(get.mock.calls.length).toBe(3); // 60 DOIs, 50 per call, over three batches of 50 entries
    const project = (await listProjects(db.pool, user)).find((p) => p.name === 'Imported')!;
    expect(project.count).toBe(120);
    const items = await listItems(db.pool, user, { sort: 'added_desc', page: 1, perPage: 100, project: project.id });
    expect(items.total).toBe(120);
    expect(items.items.every((i) => i.addedVia === 'import')).toBe(true);
    const { rows } = await db.pool.query(`select p.origin, count(*)::int as n from shelf_item i join shelf_paper p on p.id = i."paperId" where i."userId" = $1 group by p.origin order by p.origin`, [user]);
    expect(rows).toEqual([{ origin: 'import', n: 60 }, { origin: 'openalex', n: 60 }]);
  }, 60_000);

  it('skips papers already on the shelf, including repeats inside the file', async () => {
    const { client } = fakeClient();
    const id = await startImport(db.pool, config, user, { fileName: 'again.bib', text: bib(4) + '\n' + bib(1, 200) + '\n' + bib(1, 200) });
    await runImportSlice({ db: db.pool, papers: client }, { id, budgetMs: 60_000 });
    // k0..k3 were imported before; k200 appears twice (with a DOI) and is new
    expect((await getImport(db.pool, user, id))?.counts).toMatchObject({ duplicate: 3, matched: 1, added: 2 });
  });

  it('waits for OpenAlex, then keeps entries as written after three failed tries', async () => {
    const down = Object.assign(new Error('down'), { name: 'ProviderError', code: 'unavailable' });
    const { client } = fakeClient(() => down);
    const id = await startImport(db.pool, config, user, { fileName: 'outage.bib', text: bib(2, 300) });
    expect(await runImportSlice({ db: db.pool, papers: client }, { id, budgetMs: 60_000 })).toBe('waiting');
    expect(await runImportSlice({ db: db.pool, papers: client }, { id, budgetMs: 60_000 })).toBe('waiting');
    expect(await runImportSlice({ db: db.pool, papers: client }, { id, budgetMs: 60_000 })).toBe('done');
    expect((await getImport(db.pool, user, id))?.counts).toMatchObject({ added: 2, matched: 0 });
  });

  it('only the owner can see an import', async () => {
    const other = await db.addUser();
    const id = await startImport(db.pool, config, user, { fileName: 'mine.ris', text: RIS });
    expect(await getImport(db.pool, other, id)).toBeNull();
    expect(await runImportSlice({ db: db.pool, papers: fakeClient().client }, { id, userId: other, budgetMs: 1000 })).toBe('busy');
  });

  it('the background runner finishes waiting imports and empties storage trash', async () => {
    const id = await startImport(db.pool, config, user, { fileName: 'cron.bib', text: bib(3, 400) });
    const store = memoryStore();
    store.put('shelf/x/old.pdf', new Uint8Array(1));
    await db.pool.query(`insert into shelf_storage_trash (key) values ('shelf/x/old.pdf')`);
    const { client } = fakeClient();
    const report = await runShelfJobs({ db: db.pool, papers: () => client, store }, 20_000, DEFAULT_STEPS);
    expect(report).toMatchObject({ filesRemoved: 1 });
    expect((await getImport(db.pool, user, id))?.status).toBe('done');
    expect(store.has('shelf/x/old.pdf')).toBe(false);
  }, 30_000);
});
