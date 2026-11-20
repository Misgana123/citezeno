import { describe, expect, it } from 'vitest';
import { itemBox, pageToText, readPdfPages, readPdfText } from '@/lib/providers/pdfjs/reader';
import { pagesReader } from '@/lib/providers/pdf-text/pages';
import { textPdf } from '../fixtures/text-pdf';
import { scannedPdf } from '../shelf/pdf-fixtures';

const paper = () =>
  textPdf(
    [
      [
        { text: 'Rivers and floods in a changing climate', y: 720, size: 18 },
        { text: 'A. Writer and B. Author', y: 690, size: 10 },
        { text: 'doi: 10.1234/abc.5', y: 670, size: 10 },
      ],
      [
        { text: 'Methods. We measured the rivers every spring for twenty years and compared the floods.', y: 720 },
        { text: 'Results show more floods.', y: 706 },
      ],
    ],
    { title: 'Rivers and floods' },
  );

describe('PDF.js text provider', () => {
  it('reads each page’s text runs with positions as fractions of the page', async () => {
    const { pageCount, pages } = await readPdfPages(paper());
    expect(pageCount).toBe(2);
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]).toMatchObject({ width: 612, height: 792 });
    const title = pages[0].items.find((i) => i.str.includes('Rivers'))!;
    expect(title.str).toContain('Rivers and floods in a changing climate');
    // drawn at x=72, baseline y=720 (from the bottom) at 18pt → top-left box
    expect(title.x).toBeCloseTo(72 / 612, 3);
    expect(title.y).toBeCloseTo((792 - 720 - 18) / 792, 3);
    expect(title.h).toBeCloseTo(18 / 792, 3);
    expect(title.size).toBeCloseTo(18 / 792, 3);
    const body = pages[1].items.find((i) => i.str.startsWith('Methods'))!;
    expect(body.w).toBeGreaterThan(0.3);
    expect(pageToText(pages[1])).toContain('compared the floods.');
  });

  it('stops at maxPages but still reports the page count', async () => {
    const r = await readPdfPages(paper(), { maxPages: 1 });
    expect(r.pageCount).toBe(2);
    expect(r.pages).toHaveLength(1);
  });

  it('reads plain text, the DOI and the Info title', async () => {
    const r = await readPdfText(paper());
    expect(r).toMatchObject({ pageCount: 2, title: 'Rivers and floods', doi: '10.1234/abc.5' });
    expect(r.text).toContain('We measured the rivers');
  });

  it('a scanned PDF has pages but no text', async () => {
    const r = await readPdfPages(scannedPdf());
    expect(r.pageCount).toBe(1);
    expect(r.pages[0].items.filter((i) => i.str.trim())).toEqual([]);
  });

  it('rejects something that is not a PDF', async () => {
    await expect(readPdfPages(new TextEncoder().encode('<html>Sign in</html>'))).rejects.toBeTruthy();
  });

  it('boxes vertical text along the page', () => {
    // a run rotated 90°: advance goes up the page
    const vt = [1, 0, 0, -1, 0, 792];
    const box = itemBox(vt, { str: 'arXiv', transform: [0, 10, -10, 0, 30, 400], width: 50, hasEOL: false }, 612, 792)!;
    expect(box.h).toBeCloseTo(50 / 792, 3);
    expect(box.w).toBeCloseTo(10 / 612, 3);
    expect(itemBox(vt, { transform: [1, 0, 0, 1, 0, 0] }, 612, 792)).toBeNull();
  });

  it('the job hands out a reader that can read pages, even when the Shelf keeps the built-in one', () => {
    const gate = ((t: unknown) => t) as never;
    expect(pagesReader({}, gate).name).toBe('pdfjs');
    expect(pagesReader({ PDF_TEXT_PROVIDER: 'pdfjs' }, gate).name).toBe('pdfjs');
  });
});
