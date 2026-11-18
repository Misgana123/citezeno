import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanDoi, delatex, detectFormat, parseBibtex, parseName, parseReferences, parseRis } from '@/lib/bibimport';
import { importReferences, render } from '@/lib/engine';
import type { Source } from '@/lib/types';
import { makeResult } from './fixtures/trace';

const fixture = (f: string) => readFileSync(`tests/fixtures/refs/${f}`, 'utf8');
const byTitle = (list: Source[], t: string) => list.find((s) => s.title.startsWith(t))!;

describe('BibTeX from Zotero', () => {
  const r = parseBibtex(fixture('zotero.bib'));
  it('reads every entry', () => {
    expect(r.failed).toEqual([]);
    expect(r.sources).toHaveLength(5);
  });
  it('maps the fields', () => {
    const oke = byTitle(r.sources, 'The energetic basis');
    expect(oke).toMatchObject({
      type: 'article', year: 1982, month: 1, container: 'Quarterly Journal of the Royal Meteorological Society',
      volume: '108', issue: '455', pages: '1–24', doi: '10.1002/qj.49710845502', provider: 'Imported',
    });
    expect(oke.authors).toEqual([{ family: 'Oke', given: 'T. R.' }]);
    expect(oke.keywords).toEqual(['heat island', 'urban climate']);
  });
  it('keeps corporate authors whole', () => {
    expect(byTitle(r.sources, 'WHO housing').authors).toEqual([{ family: 'World Health Organization', literal: true }]);
    expect(byTitle(r.sources, 'WHO housing')).toMatchObject({ type: 'book', publisher: 'World Health Organization', place: 'Geneva', isbn: '978-92-4-155037-6' });
  });
  it('turns LaTeX accents into letters', () => {
    const ch = byTitle(r.sources, 'Cooling the city');
    expect(ch.title).toBe('Cooling the city: Green roofs in München and Zürich');
    expect(ch.authors.map((a) => `${a.given} ${a.family}`)).toEqual(['Ayşe Öztürk', 'Jörg Müller', 'José García Márquez']);
    expect(ch).toMatchObject({ type: 'chapter', container: 'Urban Climate Adaptation', pages: '45–67' });
    expect(ch.editors).toEqual([{ family: 'Smith', given: 'Jane' }]);
    expect(byTitle(r.sources, 'Heat exposure').authors[1].family).toBe('Šimić');
  });
  it('handles a missing year and web pages', () => {
    const web = byTitle(r.sources, 'Plan climat');
    expect(web.title).toBe('Plan climat de Paris & adaptation aux vagues de chaleur');
    expect(web).toMatchObject({ type: 'web', year: null, url: 'https://www.paris.fr/pages/plan-climat', site: 'www.paris.fr' });
  });
});

describe('BibTeX from Mendeley', () => {
  const r = parseBibtex(fixture('mendeley.bib'));
  it('reads good entries and reports bad ones with a reason', () => {
    expect(r.sources.map((s) => s.title.slice(0, 20))).toEqual(['The energetic basis ', 'On the impact of urb', 'Beating the Heat: A ', 'The heat-health nexu']);
    expect(r.failed).toHaveLength(2);
    expect(r.failed[0].label).toBe('@article{Broken2020}');
    expect(r.failed[0].reason).toMatch(/never closed|brace/);
    expect(r.failed[1]).toEqual({ label: '@article{NoTitle2020}', reason: 'It has no title.' });
  });
  it('cleans DOIs given as URLs and double-braced titles', () => {
    const s = byTitle(r.sources, 'On the impact');
    expect(s.doi).toBe('10.1016/j.enbuild.2014.07.022');
    expect(s.title).not.toMatch(/[{}]/);
    expect(s.authors).toHaveLength(4);
    expect(byTitle(r.sources, 'Beating the Heat')).toMatchObject({ type: 'report', publisher: 'UNEP', authors: [{ family: 'United Nations Environment Programme', literal: true }] });
  });
});

describe('RIS from EndNote and Zotero', () => {
  it('EndNote: corporate authors, chapters, missing years, non-English titles, failures', () => {
    const r = parseRis(fixture('endnote.ris'));
    expect(r.sources).toHaveLength(4);
    expect(r.failed).toEqual([{ label: 'Reference 5', reason: 'It has no title.' }]);
    expect(byTitle(r.sources, 'Heat and health').authors).toEqual([{ family: 'World Health Organization', literal: true }]);
    expect(byTitle(r.sources, 'Heat and health')).toMatchObject({ type: 'report', year: 2021, place: 'Copenhagen', isbn: '978-92-890-5540-6' });
    const ch = byTitle(r.sources, 'Local climate zones');
    expect(ch).toMatchObject({ type: 'chapter', container: 'Urban Climates', pages: '77–96', year: null });
    expect(ch.editors).toEqual([{ family: 'Oke', given: 'T. R.' }]);
    const web = byTitle(r.sources, 'Københavns');
    expect(web.authors[0]).toEqual({ family: 'Søren Kierkegaard Institute for Urban Heat', literal: true });
    // Y2 is when it was accessed, not published
    expect(web.year).toBeNull();
    // ISSNs are not ISBNs
    expect(byTitle(r.sources, 'The energetic').isbn).toBeUndefined();
  });
  it('Zotero: multi-line abstracts, dates, keywords', () => {
    const r = parseRis(fixture('zotero.ris'));
    expect(r.failed).toEqual([]);
    const s = byTitle(r.sources, 'Street trees');
    expect(s).toMatchObject({ year: 2010, month: 9, container: 'Landscape and Urban Planning', volume: '97', issue: '3', pages: '147–155', doi: '10.1016/j.landurbplan.2010.05.006' });
    expect(s.abstract).toBe('We review evidence that greening cools urban areas, using a meta-analysis.');
    expect(s.keywords).toEqual(['Urban greening', 'Cooling']);
    expect(byTitle(r.sources, 'Urban Climates')).toMatchObject({ type: 'book', year: null, authors: [{ family: 'Oke', given: 'T. R.' }, { family: 'Mills', given: 'G.' }, { family: 'Christen', given: 'A.' }, { family: 'Voogt', given: 'J. A.' }] });
  });
});

describe('helpers', () => {
  it('detects the format of pasted text', () => {
    expect(detectFormat(fixture('zotero.ris'))).toBe('ris');
    expect(detectFormat(fixture('zotero.bib'))).toBe('bibtex');
    expect(detectFormat('just some text')).toBe('unknown');
    expect(parseReferences('nothing here').sources).toEqual([]);
  });
  it('parses names and DOIs', () => {
    expect(parseName('Ludwig van Beethoven')).toEqual({ family: 'van Beethoven', given: 'Ludwig' });
    expect(parseName('King, Jr., Martin Luther')).toEqual({ family: 'King', suffix: 'Jr.', given: 'Martin Luther' });
    expect(cleanDoi('https://doi.org/10.1000/ABC.1.')).toBe('10.1000/ABC.1');
    expect(cleanDoi('doi:10.1000/x%2Fy')).toBe('10.1000/x/y');
    expect(cleanDoi('not a doi')).toBeUndefined();
    expect(delatex('{\\"a}{\\ss} \\& -- \\emph{x}')).toBe('äß & – x');
  });
  it('handles @string macros and # concatenation', () => {
    const r = parseBibtex('@string{ucj = "Urban Climate Journal"}\n@article{k, title = "A " # "joined" # { title}, journal = ucj, year = 2001}');
    expect(r.sources[0]).toMatchObject({ title: 'A joined title', container: 'Urban Climate Journal', year: 2001 });
  });
});

describe('importing into a trace', () => {
  it('skips duplicates by DOI or by title + year, inside the file and against the trace', () => {
    const base = makeResult(); // already cites Oke 1982 (by DOI) and Climate and the City 2019 (no DOI)
    const file = [
      ...parseBibtex(fixture('zotero.bib')).sources,
      ...parseRis(fixture('zotero.ris')).sources,
      { provider: 'Imported', type: 'book', title: 'Climate and the City', authors: [{ family: 'Rivera', given: 'A.' }], year: 2019 } as Source,
      { provider: 'Imported', type: 'article', title: 'Street trees and the cooling of urban surfaces: a meta-analysis', authors: [], year: 2010 } as Source,
    ];
    const { result, added, duplicates } = importReferences(base, file);
    expect(added).toHaveLength(6);
    expect(duplicates.map((d) => d.title.slice(0, 20))).toEqual(['The energetic basis ', 'Climate and the City', 'Street trees and the']);
    expect(result.mine).toEqual(added);
    added.forEach((id) => expect(result.db.get(id)!.provider).toBe('Imported'));
    // importing again finds everything already there
    expect(importReferences(result, file).added).toEqual([]);
  });

  it('imported sources are formatted by the style engine like any other', () => {
    const base = makeResult();
    const { result, added } = importReferences(base, parseBibtex(fixture('zotero.bib')).sources);
    const withRefs = { ...result, extra: added };
    const apa = render(withRefs, 'apa', 'list', {}).refPlain;
    expect(apa).toContain('World Health Organization. (2018). WHO housing and health guidelines');
    expect(apa).toContain('Öztürk, A., Müller, J., & García Márquez, J. (2019)');
    expect(apa).toContain('Plan climat de Paris & adaptation aux vagues de chaleur. (n.d.). In www.paris.fr.');
    const ieee = render(withRefs, 'ieee', 'list', {}).refPlain;
    expect(ieee).toMatch(/\[\d+\] .*World Health Organization/);
  });
});
