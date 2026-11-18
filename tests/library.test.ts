import { describe, expect, it } from 'vitest';
import { archiveName, bibliographyText, buildArchive, collectFull, datePart, safeName, singleArchiveName, traceFiles } from '@/lib/export-all';
import { ACCOUNT_MAX, ACCOUNT_NOTICE, LOCAL_MAX, evictionFor, toSaved, type Saved } from '@/lib/library';
import { unzipEntry } from '@/lib/zip';
import { makeResult } from './fixtures/trace';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const entry = (id: string, title: string, savedAt: number, style = 'apa'): Saved => ({
  ...toSaved(id, title, `${title}. Cities are often warmer than the countryside around them.`, style, 'intext', makeResult()),
  savedAt,
});

/* names of the files in a stored zip, from its central directory */
function zipNames(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nlen = v.getUint16(p + 28, true);
    names.push(new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen)));
    p += 46 + nlen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return names;
}
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('library limits', () => {
  it('has the documented caps', () => {
    expect(LOCAL_MAX).toBe(12);
    expect(ACCOUNT_MAX).toBe(200);
    expect(ACCOUNT_NOTICE).toBe(190);
  });

  it('names the oldest trace only when a new one would not fit', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, savedAt: 1000 + i * (i % 2 ? 1 : 7), title: `T${i}` }));
    const oldest = items.reduce((a, b) => (b.savedAt < a.savedAt ? b : a));
    expect(evictionFor(items, 'new', 12)).toBe(oldest);
    // updating a trace that is already there removes nothing
    expect(evictionFor(items, 't5', 12)).toBeNull();
    // room left
    expect(evictionFor(items.slice(1), 'new', 12)).toBeNull();
    // unknown size (account list not loaded yet)
    expect(evictionFor(items, 'new', Infinity)).toBeNull();
    expect(evictionFor([], 'new', 0)).toBeNull();
  });
});

describe('download all drafts', () => {
  it('makes safe file names from titles and dates', () => {
    expect(safeName('Heat / islands: a "review"?')).toBe('Heat islands a review');
    expect(safeName('   ')).toBe('Untitled');
    expect(safeName('a'.repeat(100)).length).toBeLessThanOrEqual(60);
    expect(safeName('One two three four five six seven eight nine ten eleven twelve thirteen')).not.toMatch(/\s$/);
    expect(safeName('trailing dots...')).toBe('trailing dots');
    expect(datePart(at(2026, 3, 7))).toBe('2026-03-07');
    expect(archiveName(at(2026, 11, 17))).toBe('citezeno-drafts-2026-11-17.zip');
  });

  it('writes draft, bibliography and data files per trace', () => {
    const s = entry('t1', 'Urban heat', at(2026, 11, 2), 'mla');
    const files = traceFiles(s);
    expect(files.map((f) => f.name)).toEqual([
      '2026-11-02 Urban heat - draft.txt',
      '2026-11-02 Urban heat - bibliography (MLA).txt',
      '2026-11-02 Urban heat - trace.json',
    ]);
    expect(files[0].data).toContain('Cities are often warmer');
    expect(files[1].data).toContain('Oke');
    expect(JSON.parse(files[2].data as string)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(singleArchiveName(s)).toBe('2026-11-02 Urban heat.zip');
  });

  it('formats the bibliography in each trace’s own style', () => {
    expect(bibliographyText(entry('a', 'A', 1, 'apa'))).toContain('Oke, T. R. (1982)');
    expect(bibliographyText(entry('b', 'B', 1, 'ieee'))).toMatch(/\[1\]/);
    const empty = entry('c', 'C', 1);
    empty.result = { ...empty.result, claims: empty.result.claims.map((c) => ({ ...c, ids: [] })), extra: [] };
    expect(bibliographyText(empty)).toMatch(/No sources/);
  });

  it('builds one zip, newest first, with unique names', async () => {
    const list = [entry('a', 'Same title', at(2026, 1, 5)), entry('b', 'Same title', at(2026, 1, 5)), entry('c', 'Newer', at(2026, 2, 1))];
    const z = buildArchive(list);
    const names = zipNames(z);
    expect(names).toHaveLength(9);
    expect(names[0]).toBe('2026-02-01 Newer - draft.txt');
    expect(names).toContain('2026-01-05 Same title - draft.txt');
    expect(names).toContain('2026-01-05 Same title (2) - draft.txt');
    const json = await unzipEntry(ab(z), '2026-02-01 Newer - trace.json');
    expect(JSON.parse(new TextDecoder().decode(json!)).id).toBe('c');
  });

  it('loads rows without data, a few at a time, and reports failures', async () => {
    const full = entry('local', 'Local', 5);
    const rows = [
      full,
      ...Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, title: `Remote ${i}`, savedAt: i, sources: 1 })),
    ];
    let active = 0;
    let peak = 0;
    const got: string[] = [];
    const seen: number[] = [];
    const { saved, failed } = await collectFull(
      rows,
      async (id) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        got.push(id);
        if (id === 'r3') throw new Error('offline');
        return entry(id, id, 1);
      },
      (done) => seen.push(done),
      4,
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(got).not.toContain('local');
    expect(saved).toHaveLength(9);
    expect(saved).toContain(full);
    expect(failed).toEqual(['Remote 3']);
    expect(seen.at(-1)).toBe(10);
  });
});
