import { z } from 'zod';
import { robotoFontFiles } from './fonts';

/* Charts as PNG pictures: the assistant sends the numbers, we write the
   Vega-Lite spec (the model never writes one, so no data is loaded from
   anywhere), Vega lays it out as SVG with no browser, and resvg paints it
   with Roboto, so text looks the same on every server. */

export const CHART_KINDS = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'scatter', 'histogram', 'box', 'heatmap'] as const;
/* Kinds whose series hold raw numbers (samples), not one value per category. */
const SAMPLES = new Set<string>(['histogram', 'box']);
const WITH_ERRORS = new Set<string>(['bar', 'horizontal_bar', 'line']);
const SERIES_MAX = 8;
const POINTS_MAX = 500;

const series = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.array(z.number().finite()).max(POINTS_MAX).optional().describe('One number per category; for histogram and box, the raw numbers (samples) of this series or group. Not for scatter.'),
  errors: z.array(z.number().finite().min(0)).max(POINTS_MAX).optional().describe('Error bars (bar, horizontal_bar, line): ± this much around each value, one per category (e.g. a standard deviation or a 95% CI half-width).'),
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
    trendLine: z.boolean().optional().describe('Scatter only: draw a straight least-squares line through each series.'),
    bins: z.number().int().min(2).max(100).optional().describe('Histogram only: about how many bars (default 20).'),
  })
  .superRefine((c, ctx) => {
    for (const [i, s] of c.series.entries()) {
      if (c.kind === 'scatter') {
        if (!s.points?.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'points'], message: 'A scatter chart needs [x, y] points' });
      } else if (SAMPLES.has(c.kind)) {
        if (!s.values?.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'values'], message: 'Give the raw numbers in values' });
      } else if (!c.categories?.length) ctx.addIssue({ code: 'custom', path: ['categories'], message: 'This chart needs categories' });
      else if (s.values?.length !== c.categories.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'values'], message: 'Give one value per category' });
      if (s.errors) {
        if (!WITH_ERRORS.has(c.kind)) ctx.addIssue({ code: 'custom', path: ['series', i, 'errors'], message: 'Error bars go on bar, horizontal_bar or line charts' });
        else if (s.errors.length !== c.categories?.length) ctx.addIssue({ code: 'custom', path: ['series', i, 'errors'], message: 'Give one error per category' });
        else if (c.stacked) ctx.addIssue({ code: 'custom', path: ['stacked'], message: 'Stacked bars can’t have error bars' });
      }
    }
    if (c.trendLine && c.kind !== 'scatter') ctx.addIssue({ code: 'custom', path: ['trendLine'], message: 'A trend line goes on a scatter chart' });
    if (c.bins && c.kind !== 'histogram') ctx.addIssue({ code: 'custom', path: ['bins'], message: 'bins is for histograms' });
  });

export type ChartInput = z.infer<typeof chartInput>;

const WIDTH = 720;
const HEIGHT = 400;
const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

/* The Vega-Lite spec for a chart (data inline, nothing else). */
export function chartSpec(c: ChartInput): Record<string, unknown> {
  const many = c.series.length > 1;
  const order = c.categories ?? [];
  const names = c.series.map((s) => s.name);
  const rows =
    c.kind === 'scatter'
      ? c.series.flatMap((s) => (s.points ?? []).map(([x, y]) => ({ series: s.name, x, y })))
      : SAMPLES.has(c.kind)
        ? c.series.flatMap((s) => s.values!.map((value) => ({ series: s.name, value })))
        : c.kind === 'pie'
          ? order.map((category, i) => ({ category, value: c.series[0].values![i] }))
          : c.series.flatMap((s) => order.map((category, i) => ({ series: s.name, category, value: s.values![i], ...(s.errors ? { lo: s.values![i] - s.errors[i], hi: s.values![i] + s.errors[i] } : {}) })));
  const errors = c.series.some((s) => s.errors);
  const errorBar = { type: 'errorbar', ticks: { size: 8 }, color: '#111827', strokeWidth: 1.5 };
  const color = many ? { color: { field: 'series', type: 'nominal', title: null, sort: c.series.map((s) => s.name) } } : {};
  const cat = { field: 'category', type: 'nominal', sort: order, title: c.xLabel ?? null, axis: { labelAngle: order.some((o) => o.length > 6) && order.length > 6 ? -40 : 0, labelLimit: 140 } };
  const val = { field: 'value', type: 'quantitative', title: c.yLabel ?? null, ...(c.stacked ? { stack: 'zero' } : { stack: null }) };

  let layer: Record<string, unknown>;
  switch (c.kind) {
    case 'bar': {
      const offset = many && !c.stacked ? { xOffset: { field: 'series', sort: names } } : {};
      layer = { mark: { type: 'bar', cornerRadiusEnd: 2 }, encoding: { x: cat, y: val, ...color, ...offset } };
      if (errors) layer = { layer: [layer, { mark: errorBar, encoding: { x: cat, y: { field: 'lo', type: 'quantitative', title: c.yLabel ?? null }, y2: { field: 'hi' }, ...offset } }] };
      break;
    }
    case 'horizontal_bar': {
      const offset = many && !c.stacked ? { yOffset: { field: 'series', sort: names } } : {};
      const y = { ...cat, axis: { labelLimit: 200 } };
      layer = { mark: { type: 'bar', cornerRadiusEnd: 2 }, encoding: { y, x: val, ...color, ...offset } };
      if (errors) layer = { layer: [layer, { mark: errorBar, encoding: { y, x: { field: 'lo', type: 'quantitative', title: c.yLabel ?? null }, x2: { field: 'hi' }, ...offset } }] };
      break;
    }
    case 'line': {
      const x = { ...cat, type: 'ordinal' };
      layer = { mark: { type: 'line', point: true, strokeWidth: 2.5 }, encoding: { x, y: { ...val, stack: null }, ...color } };
      // each series' error bars in its own colour
      if (errors) layer = { layer: [layer, { mark: { type: 'errorbar', ticks: { size: 8 }, strokeWidth: 1.5 }, encoding: { x, y: { field: 'lo', type: 'quantitative', title: c.yLabel ?? null }, y2: { field: 'hi' }, ...color } }] };
      break;
    }
    case 'area':
      layer = { mark: { type: 'area', opacity: c.stacked ? 0.85 : 0.45, line: true }, encoding: { x: { ...cat, type: 'ordinal' }, y: val, ...color } };
      break;
    case 'pie':
      layer = {
        mark: { type: 'arc', innerRadius: 0, stroke: '#ffffff', strokeWidth: 1.5 },
        encoding: { theta: { field: 'value', type: 'quantitative', stack: true }, color: { field: 'category', type: 'nominal', sort: order, title: null } },
      };
      break;
    case 'scatter': {
      const xy = { x: { field: 'x', type: 'quantitative', title: c.xLabel ?? null, scale: { zero: false } }, y: { field: 'y', type: 'quantitative', title: c.yLabel ?? null, scale: { zero: false } } };
      layer = { mark: { type: 'point', filled: true, size: 60, opacity: 0.8 }, encoding: { ...xy, ...color } };
      if (c.trendLine)
        layer = { layer: [layer, { transform: [{ regression: 'y', on: 'x', ...(many ? { groupby: ['series'] } : {}) }], mark: { type: 'line', strokeWidth: 2, ...(many ? {} : { color: '#111827' }) }, encoding: { ...xy, ...color } }] };
      break;
    }
    case 'histogram':
      layer = {
        mark: { type: 'bar', opacity: many ? 0.55 : 1, binSpacing: 1 },
        encoding: {
          x: { field: 'value', type: 'quantitative', bin: { maxbins: c.bins ?? 20 }, title: c.xLabel ?? null },
          y: { aggregate: 'count', type: 'quantitative', title: c.yLabel ?? 'Count', stack: null },
          ...color,
        },
      };
      break;
    case 'box':
      layer = {
        mark: { type: 'boxplot', extent: 1.5, size: 36, median: { color: '#111827' } },
        encoding: {
          x: { field: 'series', type: 'nominal', sort: names, title: c.xLabel ?? null, axis: { labelAngle: 0, labelLimit: 140 } },
          y: { field: 'value', type: 'quantitative', title: c.yLabel ?? null, scale: { zero: false } },
          color: { field: 'series', type: 'nominal', sort: names, legend: null },
        },
      };
      break;
    case 'heatmap': {
      const all = c.series.flatMap((s) => s.values!);
      const dark = Math.min(...all) + 0.6 * (Math.max(...all) - Math.min(...all));
      const xy = { x: { ...cat, axis: { ...cat.axis, orient: 'top' } }, y: { field: 'series', type: 'nominal', sort: names, title: c.yLabel ?? null } };
      layer = {
        layer: [
          { mark: { type: 'rect' }, encoding: { ...xy, color: { field: 'value', type: 'quantitative', title: null, scale: { scheme: 'blues' } } } },
          // white numbers on the darker cells
          { mark: { type: 'text', fontSize: 12 }, encoding: { ...xy, text: { field: 'value', type: 'quantitative', format: '~r' }, color: { condition: { test: `datum.value > ${dark}`, value: '#ffffff' }, value: '#111827' } } },
        ],
      };
      break;
    }
  }
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: c.kind === 'pie' ? HEIGHT : c.kind === 'box' ? Math.min(WIDTH, 120 + 110 * c.series.length) : WIDTH,
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
