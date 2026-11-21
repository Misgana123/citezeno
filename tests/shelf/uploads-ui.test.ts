import { describe, expect, it } from 'vitest';
import { filtersFromParams, filtersToParams, listParams } from '@/components/shelf/shelf-state';
import { addedLabel, tileInfo } from '@/components/shelf/uploads/tile-info';
import { pdfsIn } from '@/components/shelf/uploads/useFileDrop';
import type { ShelfItem } from '@/lib/shelf/types';
import { paper } from './fixtures';

// local times, so the day labels hold in any time zone
const NOW = new Date(2026, 10, 21, 15);
const at = (m: number, d: number, h = 10, y = 2026) => new Date(y, m, d, h).toISOString();

const item = (over: Partial<ShelfItem> = {}, paperOver: Partial<ShelfItem['paper']> = {}): ShelfItem => ({
  id: 'i1',
  paper: { ...paper('openalex:W1'), origin: 'provider', ...paperOver },
  addedAt: at(10, 21, 9),
  addedVia: 'upload',
  readingStatus: 'to_read',
  note: null,
  projectIds: [],
  folderIds: [],
  tagIds: [],
  pdfs: [{ id: 'f1', fileName: 'a.pdf', sizeBytes: 2.1 * 1024 * 1024, pageCount: 18, textStatus: 'done' }],
  reading: null,
  ...over,
});

describe('upload tiles', () => {
  it('show size, pages and when it was added', () => {
    expect(tileInfo(item(), NOW)).toMatchObject({ pdfId: 'f1', pages: 18, meta: '2.1 MB · 18 pages · Today', progress: null, action: 'Read', where: null });
  });

  it('name the matched paper, or call it the user’s own document', () => {
    expect(tileInfo(item({}, { authors: [{ name: 'D. Ivanov' }, { name: 'A. Dolgui' }] as ShelfItem['paper']['authors'], year: 2021 }), NOW).match).toMatch(/^Matched · .*Ivanov.* · 2021$/);
    expect(tileInfo(item({}, { origin: 'manual', provider: null }), NOW).match).toBeNull();
  });

  it('show reading progress and offer Continue while part-way through', () => {
    const t = tileInfo(item({ reading: { page: 6, pageCount: 18 } }), NOW);
    expect(t).toMatchObject({ action: 'Continue', where: 'Page 6 of 18' });
    expect(t.progress).toBeCloseTo(1 / 3);
    expect(tileInfo(item({ reading: { page: 18, pageCount: 18 } }), NOW).action).toBe('Read');
    expect(tileInfo(item({ reading: { page: 1, pageCount: 18 } }), NOW).action).toBe('Read');
  });

  it('open the newest PDF and cope with none', () => {
    const two = item({ pdfs: [item().pdfs[0], { id: 'f2', fileName: 'b.pdf', sizeBytes: 500, pageCount: null, textStatus: 'pending' }] });
    expect(tileInfo(two, NOW)).toMatchObject({ pdfId: 'f2', pages: null, meta: '1 KB · Today' });
    expect(tileInfo(item({ pdfs: [] }), NOW)).toMatchObject({ pdfId: null, meta: 'Today' });
  });

  it('date labels', () => {
    expect(addedLabel(at(10, 20), NOW)).toBe('Yesterday');
    expect(addedLabel(at(2, 4), NOW)).toBe('Mar 4');
    expect(addedLabel(at(2, 4, 10, 2025), NOW)).toBe('Mar 4, 2025');
  });
});

describe('dropping files', () => {
  it('keeps only PDFs', () => {
    const f = (name: string, type: string) => ({ name, type }) as File;
    expect(pdfsIn([f('a.pdf', 'application/pdf'), f('B.PDF', ''), f('c.docx', 'application/vnd.openxmlformats'), f('d.png', 'image/png')]).map((x) => x.name)).toEqual(['a.pdf', 'B.PDF']);
  });
});

describe('collection in the address bar', () => {
  it('Library is the default and left out; My uploads is c=uploads', () => {
    expect(filtersFromParams(new URLSearchParams('')).collection).toBe('library');
    expect(filtersFromParams(new URLSearchParams('c=nonsense')).collection).toBe('library');
    const up = filtersFromParams(new URLSearchParams('c=uploads&project=p1'));
    expect(up.collection).toBe('uploads');
    expect(filtersToParams(up).toString()).toBe('c=uploads&project=p1');
    expect(filtersToParams(filtersFromParams(new URLSearchParams('project=p1'))).toString()).toBe('project=p1');
  });

  it('keeps the uploads filters', () => {
    const f = filtersFromParams(new URLSearchParams('c=uploads&matched=0&wip=1'));
    expect(f).toMatchObject({ matched: 'no', wip: true });
    expect(filtersToParams(f).toString()).toBe('c=uploads&matched=0&wip=1');
  });

  it('listing requests always name the collection', () => {
    expect(listParams(filtersFromParams(new URLSearchParams(''))).get('c')).toBe('library');
    expect(listParams(filtersFromParams(new URLSearchParams('c=uploads'))).get('c')).toBe('uploads');
  });
});
