import { z } from 'zod';
import type { LoadedPicture } from './docx';

/* An Excel workbook (exceljs, on the server): sheets of rows with a bold,
   frozen header row and filters, numbers kept as numbers, real formulas
   when asked for ({ "formula": "SUM(B2:B9)" }), dates, and pictures made in
   this chat. Text that starts with "=" stays text: only formula cells are
   formulas, and formulas that reach outside the workbook are refused. */

const ROWS_MAX = 5000;
const COLS_MAX = 50;

export const cellSchema = z.union([
  z.string().max(5000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.object({ formula: z.string().trim().min(1).max(1000).describe('Without the leading "=", e.g. "SUM(B2:B9)".') }),
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD') }),
]);
export type Cell = z.infer<typeof cellSchema>;

export const sheetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(31)
    .refine((n) => !/[[\]:*?/\\]/.test(n), 'Sheet names can’t contain [ ] : * ? / \\'),
  headers: z.array(z.string().max(200)).max(COLS_MAX).optional(),
  rows: z.array(z.array(cellSchema).max(COLS_MAX)).max(ROWS_MAX),
  columnWidths: z.array(z.number().min(2).max(120)).max(COLS_MAX).optional().describe('In characters; worked out from the content when left out.'),
  numberFormat: z.string().max(40).optional().describe('Excel number format for numbers, e.g. "0.00" or "#,##0".'),
  images: z
    .array(z.object({ fileId: z.string().min(1).max(80), cell: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,5}$/, 'A cell like "H2"') }))
    .max(10)
    .optional()
    .describe('Charts or pictures made in this chat, placed with their top-left corner at a cell.'),
});
export type Sheet = z.infer<typeof sheetSchema>;

export const workbookInput = { filename: z.string().trim().min(1).max(120).describe('The file name, without the extension.'), sheets: z.array(sheetSchema).min(1).max(20) };

/* Functions that fetch from the web, run programs or reach other files.
   "|" is how old DDE formulas start programs; "[" points into another workbook. */
const UNSAFE_FORMULA = /\b(WEBSERVICE|FILTERXML|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|IMAGE|HYPERLINK|CALL|REGISTER(\.ID)?|EXEC|RTD|DDE|INFO|CELL)\s*\(|[|[]|https?:|file:/i;

export function workbookProblems(sheets: Sheet[]): string | null {
  const names = new Set<string>();
  let cells = 0;
  for (const s of sheets) {
    const key = s.name.toLowerCase();
    if (names.has(key)) return `Two sheets are called "${s.name}".`;
    names.add(key);
    cells += s.rows.reduce((n, r) => n + r.length, 0);
    for (const r of s.rows)
      for (const c of r)
        if (c && typeof c === 'object' && 'formula' in c && UNSAFE_FORMULA.test(c.formula))
          return `The formula "${c.formula}" isn’t allowed (no web, file or program functions, and no links to other workbooks).`;
  }
  if (cells > 100_000) return 'The workbook is too large (over 100,000 cells). Split it into parts.';
  return null;
}

const width = (c: Cell): number => (c == null ? 0 : typeof c === 'object' ? ('date' in c ? 10 : 8) : String(c).length);

export async function buildXlsx(input: { sheets: Sheet[]; pictures: Map<string, LoadedPicture> }): Promise<Uint8Array> {
  const ExcelJS = ((await import('exceljs')) as unknown as { default?: typeof import('exceljs') }).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Citezeno';
  wb.created = new Date();
  for (const s of input.sheets) {
    const ws = wb.addWorksheet(s.name, { views: s.headers?.length ? [{ state: 'frozen', ySplit: 1 }] : [] });
    if (s.headers?.length) {
      const head = ws.addRow(s.headers);
      head.font = { bold: true };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F5' } };
      head.alignment = { vertical: 'middle' };
    }
    for (const r of s.rows) {
      const row = ws.addRow(
        r.map((c) => {
          if (c && typeof c === 'object') return 'formula' in c ? { formula: c.formula.replace(/^=/, '') } : new Date(`${c.date}T00:00:00Z`);
          return c;
        }),
      );
      r.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c && typeof c === 'object' && 'date' in c) cell.numFmt = 'yyyy-mm-dd';
        else if (typeof c === 'number' && s.numberFormat) cell.numFmt = s.numberFormat;
        // text that looks like a formula stays text
        else if (typeof c === 'string' && /^[=+\-@]/.test(c)) cell.value = { richText: [{ text: c }] };
      });
    }
    const cols = Math.max(s.headers?.length ?? 0, ...s.rows.map((r) => r.length), 0);
    for (let i = 0; i < cols; i++) {
      const fit = Math.max(s.headers?.[i]?.length ?? 0, ...s.rows.slice(0, 500).map((r) => width(r[i] ?? null)));
      ws.getColumn(i + 1).width = s.columnWidths?.[i] ?? Math.min(60, Math.max(8, fit + 2));
    }
    if (s.headers?.length && s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.headers.length } };
    for (const img of s.images ?? []) {
      const p = input.pictures.get(img.fileId);
      if (!p) continue;
      const id = wb.addImage({ base64: Buffer.from(p.bytes).toString('base64'), extension: p.type === 'jpg' ? 'jpeg' : 'png' });
      const scale = Math.min(1, 640 / p.width);
      const at = ws.getCell(img.cell);
      ws.addImage(id, { tl: { col: Number(at.col) - 1, row: Number(at.row) - 1 }, ext: { width: Math.round(p.width * scale), height: Math.round(p.height * scale) } });
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
