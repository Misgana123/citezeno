import { describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { referenceLines, STYLE_IDS, writeReferences } from '@/lib/agent/tools/references';
import { runTool } from '@/lib/agent/tools/run';
import type { Paper } from '@/lib/papers/types';
import { shelfConfig } from '@/lib/shelf/config';
import { ORDER } from '@/lib/styles';
import { paper } from '../shelf/fixtures';

const lookups: string[] = [];
vi.mock('@/lib/shelf/service/lookup', () => ({
  lookupPaper: vi.fn(async (_deps: unknown, _user: string, input: string) => {
    lookups.push(input);
    return { via: 'title', papers: input.includes('Sleep spindles') ? [paper('W9', { title: 'Sleep spindles and memory', year: 2018, doi: '10.1/sleep' })] : [], saved: {} };
  }),
}));

const BIB = `@article{smith2020,
  title = {Deep learning for flood prediction},
  author = {Smith, Jane and Doe, John},
  journal = {Water Research},
  year = {2020},
  volume = {12},
  pages = {1--10},
  doi = {10.1000/flood}
}
@article{smith2020dup,
  title = {Deep Learning for Flood Prediction},
  author = {Smith, Jane},
  year = {2020},
  number = {3}
}
@book{kahneman2011,
  title = {Thinking, Fast and Slow},
  author = {Kahneman, Daniel},
  publisher = {Farrar},
  year = {2011}
}`;

const RIS = `TY  - JOUR
TI  - Coral reefs under heat stress
AU  - Lee, Min
PY  - 2019
DO  - 10.1000/coral
ER  - `;

function ctx(found: Paper[] = [], files: Record<string, string> = {}) {
  const c = {
    userId: 'u1',
    db: null as never,
    sources: () => ({ primary: { getPapers: async (_k: string, dois: string[]) => ({ found: new Map(found.filter((p) => dois.includes(p.doi!)).map((p) => [p.doi!, p])), costUsd: 0 }) } }) as never,
    papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
    shelfConfig: shelfConfig({}),
    reserveSearches: async () => {},
    webSearch: () => null,
    webFiles: () => null as never,
    pdfText: () => null as never,
    chatAttachments: async () => Object.entries(files).map(([name, text]) => ({ kind: 'text' as const, name, text })),
    code: () => null,
    files: { save: async () => null as never, read: async () => null, readShelfPdf: async () => null },
  } satisfies AgentContext;
  return c;
}

describe('clean_references', () => {
  it('offers every citation style the Studio has', () => {
    expect([...STYLE_IDS]).toEqual(ORDER);
  });

  it('merges files, removes duplicates keeping both copies’ details, and writes BibTeX', async () => {
    const r = await runTool(ctx([], { 'a.bib': BIB, 'b.ris': RIS }), 'clean_references', { sources: [{ attachment: 'a.bib' }, { attachment: 'b.ris' }], format: 'bibtex', filename: 'thesis' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileName: 'thesis.bib', read: 4, kept: 3, duplicatesMerged: 1 }, display: { summary: '3 references, 1 merged' } } });
    const text = (r.outcome as { output: { display: { file: { text: string } } } }).output.display.file.text;
    expect(text.match(/^@/gm)).toHaveLength(3);
    // the kept copy has the journal from the first and the issue from the second
    expect(text).toMatch(/journal\s+= \{Water Research\}/);
    expect(text).toMatch(/number\s+= \{3\}/);
    expect(text).toContain('10.1000/coral');
  });

  it('writes a reference list in a style, sorted for author–date and numbered for numeric', () => {
    const list = [
      { id: 'a', provider: 'x', type: 'article' as const, title: 'Zebra stripes', authors: [{ family: 'Young', given: 'Al' }], year: 2001, container: 'Nature' },
      { id: 'b', provider: 'x', type: 'article' as const, title: 'Ant colonies', authors: [{ family: 'Adams', given: 'Bo' }], year: 1999, container: 'Science' },
    ];
    const apa = writeReferences(list, 'apa');
    expect(apa.indexOf('Adams')).toBeLessThan(apa.indexOf('Young'));
    expect(apa).not.toContain('<i>');
    const ieee = writeReferences(list, 'ieee');
    expect(ieee).toMatch(/\[1\] .*Young/);
    expect(writeReferences(list, 'vancouver')).toMatch(/^1\. Young/m);
  });

  it('says which entries miss details, and refuses text that isn’t BibTeX or RIS', async () => {
    const r = await runTool(ctx(), 'clean_references', { sources: [{ text: '@misc{x, title = {A dataset of rivers}}' }], format: 'ris' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { missingDetails: 1, missingDetailsEntries: [{ title: 'A dataset of rivers', missing: ['authors', 'year', 'journal or publisher'] }] } } });
    expect((await runTool(ctx(), 'clean_references', { sources: [{ text: 'just some words here' }], format: 'bibtex' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('check_references') });
  });
});

describe('check_references', () => {
  it('reads a pasted list one reference per line, with numbering removed', () => {
    const lines = referenceLines('[1] Smith, J. (2020). Deep learning for flood prediction. https://doi.org/10.1000/flood.\n2. Lee, M. (2019). Coral reefs under heat stress.\nshort');
    expect(lines.map((l) => [l.doi, l.year])).toEqual([
      ['10.1000/flood', 2020],
      [null, 2019],
    ]);
    expect(lines[0].line).toMatch(/^Smith/);
    // blank lines between references: each paragraph is one, even when it wraps
    expect(referenceLines('Smith, J. (2020). Deep learning\nfor flood prediction.\n\nLee, M. (2019). Coral reefs under heat stress.')).toHaveLength(2);
  });

  it('checks DOIs for free, flags wrong titles, far-off years and retractions', async () => {
    const found = [
      paper('W1', { doi: '10.1000/flood', title: 'Deep learning for flood prediction', year: 2020 }),
      paper('W2', { doi: '10.1000/coral', title: 'Something else entirely about soils', year: 2015, isRetracted: true }),
    ];
    const text = 'Smith, J. (2020). Deep learning for flood prediction. Water Research. doi:10.1000/flood\nLee, M. (2019). Coral reefs under heat stress. doi:10.1000/coral\nDoe, A. (2021). A paper with a DOI nobody has. doi:10.1000/missing\nRoe, B. (2018). Sleep spindles and memory. Neuron.';
    const r = await runTool(ctx(found), 'check_references', { source: { text } });
    expect(r.outcome).toMatchObject({
      status: 'done',
      output: {
        result: {
          checked: 4,
          problems: 2,
          unchecked: 1,
          references: [
            { status: 'ok' },
            { status: 'mismatch', issues: ['the DOI belongs to “Something else entirely about soils”', 'year is 2019, the paper’s is 2015', 'retracted'] },
            { status: 'doi_not_found' },
            { status: 'unchecked' },
          ],
        },
        display: { summary: '4 references checked, 2 problems' },
      },
    });
    expect(lookups).toEqual([]);
  });

  it('searches titles only when asked, and finds the paper behind a reference without a DOI', async () => {
    const r = await runTool(ctx(), 'check_references', { source: { text: RIS.replace('DO  - 10.1000/coral\n', '') + '\n' + RIS.replace('Coral reefs under heat stress', 'Sleep spindles and memory').replace('DO  - 10.1000/coral\n', '') }, searchTitles: true });
    expect(lookups).toEqual(['Coral reefs under heat stress', 'Sleep spindles and memory']);
    expect(r.outcome).toMatchObject({ output: { result: { references: [{ status: 'not_found' }, { status: 'found_by_title', issues: ['no DOI given'], paper: { doi: '10.1/sleep' } }] } } });
  });
});
