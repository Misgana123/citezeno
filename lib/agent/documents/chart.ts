import { z } from 'zod';
import { robotoFontFiles } from './fonts';

/* Charts as PNG pictures: the assistant sends the numbers, we write the
   Vega-Lite spec (the model never writes one, so no data is loaded from
   anywhere), Vega lays it out as SVG with no browser, and resvg paints it
   with Roboto, so text looks the same on every server. */

export const CHART_KINDS = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'scatter'] as const;
const SERIES_MAX = 8;
const POINTS_MAX = 500;

const series = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.array(z.number().finite()).max(POINTS_MAX).optional().describe('One number per category (every kind but scatter).'),
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .max(POINTS_MAX)
    .optional()
    .describe('[x, y] pairs (scatter only).'),
});

export const chartInput = z
  .object({
    filename: z.string().trim().min(1).max(120).describe('The picture’s file name, without the extension.'),
    kind: z.enum(CHART_KINDS),
    title: z.string().max(150).optional(),
    categories: z.array(z.string().max(80)).max(POINTS_MAX).optional().describe('The labels along the axis (or the pie’s slices), in order. Not for scatter.'),
    series: z.array(series).min(1).max(SERIES_MAX).describe('One or more series. A pie uses the first one.'),
    xLabel: z.string().max(80).optional(),
    yLabel: z.string().max(80).optional(),
    stacked: z.boolean().optional().describe('Bars or areas of several series on top of each other.'),
  })
  .superRefine((c, ctx) => {
    for (const [i, s] of c.series.entries()) {
      if (c.kind === 'scatter') {
        if (!s.points?.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'points'], message: 'A scatter chart needs [x, y] points' });
      } else if (!c.categories?.length) ctx.addIssue({ code: 'custom', path: ['categories'], message: 'This chart needs categories' });
      else if (s.values?.length !== c.categories.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'values'], message: 'Give one value per category' });
    }
  });

export type ChartInput = z.infer<typeof chartInput>;

const WIDTH = 720;
const HEIGHT = 400;
const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

/* The Vega-Lite spec for a chart (data inline, nothing else). */
export function chartSpec(c: ChartInput): Record<string, unknown> {
  const many = c.series.length > 1;
  const order = c.categories ?? [];
  const rows =
    c.kind === 'scatter'
      ? c.series.flatMap((s) => (s.points ?? []).map(([x, y]) => ({ series: s.name, x, y })))
      : c.kind === 'pie'
        ? order.map((category, i) => ({ category, value: c.series[0].values![i] }))
        : c.series.flatMap((s) => order.map((category, i) => ({ series: s.name, category, value: s.values![i] })));
  const color = many ? { color: { field: 'series', type: 'nominal', title: null, sort: c.series.map((s) => s.name) } } : {};
  const cat = { field: 'category', type: 'nominal', sort: order, title: c.xLabel ?? null, axis: { labelAngle: order.some((o) => o.length > 6) && order.length > 6 ? -40 : 0, labelLimit: 140 } };
  const val = { field: 'value', type: 'quantitative', title: c.yLabel ?? null, ...(c.stacked ? { stack: 'zero' } : { stack: null }) };

  let layer: Record<string, unknown>;
  switch (c.kind) {
    case 'bar':
      layer = { mark: { type: 'bar', cornerRadiusEnd: 2 }, encoding: { x: cat, y: val, ...color, ...(many && !c.stacked ? { xOffset: { field: 'series', sort: c.series.map((s) => s.name) } } : {}) } };
      break;
    case 'horizontal_bar':
      layer = {
        mark: { type: 'bar', cornerRadiusEnd: 2 },
        encoding: { y: { ...cat, axis: { labelLimit: 200 } }, x: val, ...color, ...(many && !c.stacked ? { yOffset: { field: 'series', sort: c.series.map((s) => s.name) } } : {}) },
      };
      break;
    case 'line':
      layer = { mark: { type: 'line', point: true, strokeWidth: 2.5 }, encoding: { x: { ...cat, type: 'ordinal' }, y: { ...val, stack: null }, ...color } };
      break;
    case 'area':
      layer = { mark: { type: 'area', opacity: c.stacked ? 0.85 : 0.45, line: true }, encoding: { x: { ...cat, type: 'ordinal' }, y: val, ...color } };
      break;
    case 'pie':
      layer = {
        mark: { type: 'arc', innerRadius: 0, stroke: '#ffffff', strokeWidth: 1.5 },
        encoding: { theta: { field: 'value', type: 'quantitative', stack: true }, color: { field: 'category', type: 'nominal', sort: order, title: null } },
      };
      break;
    case 'scatter':
      layer = {
        mark: { type: 'point', filled: true, size: 60, opacity: 0.8 },
        encoding: {
          x: { field: 'x', type: 'quantitative', title: c.xLabel ?? null, scale: { zero: false } },
          y: { field: 'y', type: 'quantitative', title: c.yLabel ?? null, scale: { zero: false } },
          ...color,
        },
      };
      break;
  }
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: c.kind === 'pie' ? HEIGHT : WIDTH,
    height: HEIGHT,
    padding: 16,
    background: '#ffffff',
    ...(c.title ? { title: { text: c.title, anchor: 'start', fontSize: 17, fontWeight: 600, offset: 14 } } : {}),
    data: { values: rows },
    ...layer,
    config: {
      font: 'Roboto',
      range: { category: COLORS },
      view: { stroke: null },
      axis: { labelFontSize: 12, titleFontSize: 13, titleFontWeight: 500, gridColor: '#e5e7eb', domainColor: '#9ca3af', tickColor: '#9ca3af', labelColor: '#374151', titleColor: '#111827' },
      legend: { labelFontSize: 12, orient: 'bottom', direction: 'horizontal', symbolType: 'circle' },
    },
  };
}

/* The chart as SVG (Vega, no browser; it may load nothing). */
export async function chartSvg(c: ChartInput): Promise<string> {
  const [vega, { compile }] = await Promise.all([import('vega'), import('vega-lite')]);
  const spec = compile(chartSpec(c) as never).spec;
  const refuse = () => Promise.reject(new Error('Charts load no data.'));
  const loader = { ...vega.loader(), load: refuse, sanitize: refuse, http: refuse, file: refuse };
  const view = new vega.View(vega.parse(spec), { renderer: 'none', loader: loader as never });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

/* The chart as a PNG at twice its size (sharp on screens and in documents). */
export async function chartPng(c: ChartInput): Promise<Uint8Array> {
  const [svg, fontFiles, { Resvg }] = await Promise.all([chartSvg(c), robotoFontFiles(), import('@resvg/resvg-js')]);
  const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, background: '#ffffff', font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Roboto', sansSerifFamily: 'Roboto' } });
  return new Uint8Array(resvg.render().asPng());
}
