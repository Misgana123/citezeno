import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { chartInput, chartPng, chartSpec, chartSvg } from '@/lib/agent/documents/chart';
import { editImage } from '@/lib/agent/documents/image';
import { runTool } from '@/lib/agent/tools/run';
import { shelfConfig } from '@/lib/shelf/config';

const BAR = chartInput.parse({
  filename: 'c',
  kind: 'bar',
  title: 'Papers per year',
  categories: ['2021', '2022', '2023'],
  series: [
    { name: 'Saved', values: [3, 7, 4] },
    { name: 'Read', values: [1, 2, 3] },
  ],
  yLabel: 'Papers',
});

/* How many pixels in a PNG are dark (text, lines, bars). */
async function darkPixels(png: Uint8Array): Promise<number> {
  const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data.reduce((n, v) => n + (v < 100 ? 1 : 0), 0);
}

describe('charts', () => {
  it('checks the numbers fit the chart', () => {
    expect(chartInput.safeParse({ filename: 'c', kind: 'bar', categories: ['a', 'b'], series: [{ name: 's', values: [1] }] }).success).toBe(false);
    expect(chartInput.safeParse({ filename: 'c', kind: 'scatter', series: [{ name: 's', values: [1] }] }).success).toBe(false);
    expect(chartInput.safeParse({ filename: 'c', kind: 'scatter', series: [{ name: 's', points: [[1, 2]] }] }).success).toBe(true);
    expect(chartInput.safeParse({ filename: 'c', kind: 'bar', categories: ['a'], series: [{ name: 's', values: [Infinity] }] }).success).toBe(false);
  });

  it('writes a spec with the data inline and nothing to load', () => {
    const spec = chartSpec(BAR) as { data: { values: unknown[] }; encoding: Record<string, unknown> };
    expect(spec.data.values).toHaveLength(6);
    expect(spec.data).not.toHaveProperty('url');
    expect(spec.encoding).toHaveProperty('xOffset');
    expect(JSON.stringify(spec)).not.toMatch(/"url"|"expr"/);
  });

  it('draws every kind as SVG', async () => {
    for (const kind of ['bar', 'horizontal_bar', 'line', 'area', 'pie'] as const) {
      const svg = await chartSvg({ ...BAR, kind });
      expect(svg, kind).toMatch(/^<svg/);
    }
    expect(
      await chartSvg(
        chartInput.parse({
          filename: 'c',
          kind: 'scatter',
          series: [
            {
              name: 'a',
              points: [
                [1, 2],
                [3, 4],
              ],
            },
          ],
        }),
      ),
    ).toContain('<svg');
    expect(await chartSvg(BAR)).toContain('Papers per year');
  });

  it('paints a PNG at twice the size, with its text drawn', async () => {
    const png = await chartPng(BAR);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBeGreaterThan(1400);
    // the same chart with a long title has clearly more dark pixels: text is painted
    const withLongTitle = await chartPng({ ...BAR, title: 'Papers per year saved and read by the user, by year of saving' });
    expect((await darkPixels(withLongTitle)) - (await darkPixels(png))).toBeGreaterThan(500);
  });
});

describe('editing pictures', () => {
  const photo = () =>
    sharp({ create: { width: 400, height: 200, channels: 3, background: '#3366cc' } })
      .png()
      .toBuffer()
      .then((b) => new Uint8Array(b));

  it('resizes, crops, rotates and converts', async () => {
    const out = await editImage(await photo(), [{ op: 'crop', left: 0, top: 0, width: 200, height: 200 }, { op: 'resize', width: 100 }, { op: 'rotate', degrees: 90 }, { op: 'grayscale' }], {
      format: 'jpeg',
      quality: 70,
    });
    expect(out).toMatchObject({ width: 100, height: 100 });
    expect((await sharp(out.bytes).metadata()).format).toBe('jpeg');
  });

  it('refuses a crop past the edge and files that aren’t pictures', async () => {
    await expect(editImage(await photo(), [{ op: 'crop', left: 300, top: 0, width: 200, height: 100 }], { format: 'png' })).rejects.toThrow(/past the picture/);
    await expect(editImage(new TextEncoder().encode('not a picture'), [], { format: 'png' })).rejects.toThrow(/isn’t a picture/);
  });
});

describe('chart and picture tools', () => {
  async function ctx() {
    const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();
    const c = {
      userId: 'u1',
      db: null as never,
      sources: () => null as never,
      papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
      shelfConfig: shelfConfig({}),
      reserveSearches: async () => {},
      webSearch: () => null,
      webFiles: () => null as never,
      pdfText: () => null as never,
      chatImages: async () => [{ kind: 'image' as const, name: 'photo.png', mediaType: 'image/png' as const, data: png.toString('base64') }],
      files: {
        save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: `af_${saved.length}`, name: f.name, mime: f.mime, size: f.bytes.byteLength }),
        read: async () => null,
        readShelfPdf: async () => null,
      },
    } satisfies AgentContext;
    return { c, saved };
  }

  it('draws a chart and keeps it with the chat', async () => {
    const { c, saved } = await ctx();
    const r = await runTool(c, 'create_chart', { ...BAR, filename: 'papers' });
    expect(r.label).toBe('Drawing a bar chart “Papers per year”');
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileId: 'af_1' }, display: { summary: 'Chart ready' } } });
    expect(saved[0].mime).toBe('image/png');
  });

  it('edits a picture the user attached, found by its name', async () => {
    const { c, saved } = await ctx();
    const r = await runTool(c, 'edit_image', { attachment: 'photo.png', filename: 'small', operations: [{ op: 'resize', width: 50 }], format: 'webp' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { width: 50, height: 50 }, display: { summary: '50×50' } } });
    expect(saved[0].mime).toBe('image/webp');
    const missing = await runTool(c, 'edit_image', { attachment: 'other.png', filename: 'x' });
    expect(missing.outcome).toMatchObject({ status: 'error', message: expect.stringContaining('Attached pictures: photo.png') });
    expect((await runTool(c, 'edit_image', { filename: 'x' })).outcome).toMatchObject({ status: 'error' });
  });
});
