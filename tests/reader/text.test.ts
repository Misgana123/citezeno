import { describe, expect, it } from 'vitest';
import { readPdfPages } from '@/lib/providers/pdfjs/reader';
import { cleanLines } from '@/lib/reader/text/clean';
import { processPages } from '@/lib/reader/text';
import type { Line as PageLine } from '@/lib/reader/text/lines';
import { isHeadingText, joinLine } from '@/lib/reader/text/paragraphs';
import { sentences, tokensOf } from '@/lib/reader/text/passages';
import { textPdf, type Line } from '../fixtures/text-pdf';
import { scannedPdf } from '../shelf/pdf-fixtures';

/* Lay out a page like a paper: a running header and a page number on every
   page, then headings and paragraphs (blank space between paragraphs). */
function page(n: number, parts: ({ h: string } | { p: string } | { lines: string[] })[], start = 700): Line[] {
  const out: Line[] = [
    { text: 'Journal of Careful Tests 12 (2024)', y: 760, size: 8 },
    { text: String(n), x: 300, y: 40, size: 9 },
  ];
  let y = start;
  for (const part of parts) {
    if ('h' in part) {
      y -= 8;
      out.push({ text: part.h, y, size: 13 });
      y -= 20;
      continue;
    }
    const words = 'p' in part ? part.p.split(' ') : [];
    const rows = 'lines' in part ? part.lines : Array.from({ length: Math.ceil(words.length / 12) }, (_, i) => words.slice(i * 12, i * 12 + 12).join(' '));
    for (const text of rows) {
      out.push({ text, y, size: 11 });
      y -= 13;
    }
    y -= 9;
  }
  return out;
}

const sentence = (topic: string, i: number) => `The ${topic} study number ${i} looked at nurses working long shifts in busy wards.`;
const para = (topic: string, n: number) => Array.from({ length: n }, (_, i) => sentence(topic, i + 1)).join(' ');

function paperPdf() {
  return textPdf([
    page(1, [{ h: 'Abstract' }, { p: para('summary', 4) }, { h: '1 Introduction' }, { p: para('intro', 12) }, { p: `${para('second', 3)} Short follow` }]),
    page(2, [{ p: `up line ends here. ${para('carry', 9)}` }, { h: '2 Methods' }, { p: para('method', 6) }, { lines: ['To check the heat we used a thermo-', 'dynamic model of every ward.'] }, { p: para('long', 40) }]),
    page(3, [{ h: 'References' }, { p: 'Smith J. (2020). Sleep and shifts. Journal of Sleep 1, 1-10.' }, { p: 'Jones K. (2019). Nurses at night. Care 2, 3-9.' }]),
  ]);
}

describe('text clean-up', () => {
  it('drops running headers and page numbers', () => {
    const line = (page: number, text: string, y: number): PageLine => ({ page, text, x: 0.1, y, w: 0.5, h: 0.015, size: 0.015 });
    const pages = [1, 2, 3].map((p) => [line(p, `Journal of Tests ${p}`, 0.03), line(p, `Body text ${p}`, 0.5), line(p, String(p), 0.95)]);
    expect(cleanLines(pages).map((ls) => ls.map((l) => l.text))).toEqual([['Body text 1'], ['Body text 2'], ['Body text 3']]);
  });

  it('joins line-break hyphens inside words only', () => {
    expect(joinLine('a thermo-', 'dynamic model')).toBe('a thermodynamic model');
    expect(joinLine('the long-', 'Term view')).toBe('the long- Term view');
    expect(joinLine('', 'start')).toBe('start');
  });

  it('knows section headings', () => {
    for (const h of ['Abstract', '1 Introduction', '2.3 Data collection', 'III. Results', 'Materials and Methods', 'References']) expect(isHeadingText(h), h).toBe(true);
    for (const t of ['We used 12 wards.', 'The results show that burnout fell in every ward we studied over the year.']) expect(isHeadingText(t), t).toBe(false);
  });

  it('splits sentences without breaking abbreviations, initials or decimals', () => {
    expect(sentences('Burnout fell by 3.5 points (Smith et al. 2020). See Fig. 2 for J. Smith’s data! Done?')).toEqual([
      'Burnout fell by 3.5 points (Smith et al. 2020).',
      'See Fig. 2 for J. Smith’s data!',
      'Done?',
    ]);
    expect(tokensOf('one two three')).toBe(4);
  });
});

describe('passages', () => {
  it('turns a paper into passages with pages, sections, positions and IDs', async () => {
    const r = processPages(await readPdfPages(paperPdf()));
    if (r.status !== 'ready') throw new Error('expected text');
    const ps = r.passages;
    // no header, footer or page number inside any passage
    expect(ps.some((p) => /Journal of Careful Tests|^\d+\s/.test(p.text))).toBe(false);
    // IDs: page and place on that page, in reading order
    expect(ps[0]).toMatchObject({ id: 'p1-1', page: 1, ord: 0, section: 'Abstract', isReferences: false });
    expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
    expect(ps.map((p) => p.ord)).toEqual(ps.map((_, i) => i));
    // never across a heading: the abstract (4 short sentences) stays alone despite being short
    expect(ps[0].text).not.toContain('intro');
    // sizes: about a paragraph, long ones split at sentence ends
    for (const p of ps.filter((x) => !x.isReferences)) expect(p.text.split(' ').length).toBeLessThanOrEqual(320);
    const longOnes = ps.filter((p) => p.text.includes('The long study'));
    expect(longOnes.length).toBeGreaterThan(1);
    // overlap: the next piece starts with the last sentence of the one before
    const last = sentences(longOnes[0].text).at(-1)!;
    expect(longOnes[1].text.startsWith(last)).toBe(true);
    // the paragraph that runs onto page 2 stays one passage, starting on page 1
    const carried = ps.find((p) => p.text.includes('Short follow up line ends here.'))!;
    expect(carried.page).toBe(1);
    expect(carried.box.endPage).toBe(2);
    // hyphen at a line end joined
    expect(ps.some((p) => p.text.includes('thermodynamic model'))).toBe(true);
    // positions are fractions of the page
    for (const p of ps) for (const v of [p.box.x, p.box.y, p.box.w, p.box.h]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    // the reference list is kept but marked, and left out of the token count
    const refs = ps.filter((p) => p.isReferences);
    expect(refs.map((p) => p.section)).toEqual(['References']);
    expect(refs[0].text).toContain('Smith J. (2020)');
    expect(r.tokenCount).toBe(ps.filter((p) => !p.isReferences).reduce((n, p) => n + p.tokens, 0));
    expect(ps.find((p) => p.section === '2 Methods')).toBeTruthy();
  });

  it('marks a scan as having no text', async () => {
    expect(processPages(await readPdfPages(scannedPdf()))).toEqual({ status: 'no_text' });
    expect(processPages({ pageCount: 0, pages: [] })).toEqual({ status: 'no_text' });
  });
});
