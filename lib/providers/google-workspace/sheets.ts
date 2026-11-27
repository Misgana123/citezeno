import { ProviderError } from '../errors';
import type { CloudFile, CloudSheets } from '../connectors/types';
import { GOOGLE_SHEET } from './drive';
import { PROVIDER, SHEETS, type GoogleCall } from './http';

/* Google Sheets (v4): read a range, add rows, make a spreadsheet. Values are
   written RAW, so text that starts with "=" stays text and never runs as a formula. */

type Spreadsheet = { spreadsheetId?: string; spreadsheetUrl?: string; properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] };
type Cell = string | number | boolean | null;

/* A sheet name in A1 notation: 'My sheet'!A1:Z */
export const a1 = (sheet: string, range?: string) => `'${sheet.replace(/'/g, "''")}'${range ? `!${range}` : ''}`;

const cellValue = (v: Cell) => (typeof v === 'number' ? { numberValue: v } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: v == null ? '' : String(v) });

export function googleSheets(call: GoogleCall): CloudSheets {
  const meta = (id: string) => call<Spreadsheet>({ method: 'GET', url: `${SHEETS}/spreadsheets/${encodeURIComponent(id)}`, query: { fields: 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title' } });
  const pickSheet = (s: Spreadsheet, wanted?: string) => {
    const names = (s.sheets ?? []).map((x) => x.properties?.title ?? '').filter(Boolean);
    if (wanted && !names.includes(wanted)) throw new ProviderError('bad_request', `There is no sheet called “${wanted}”. Sheets: ${names.join(', ')}.`, { provider: PROVIDER });
    return { names, sheet: wanted ?? names[0] ?? 'Sheet1' };
  };
  return {
    async read(id, { sheet, range, maxRows }) {
      const s = await meta(id);
      const { names, sheet: name } = pickSheet(s, sheet);
      const r = await call<{ range?: string; values?: Cell[][] }>({ method: 'GET', url: `${SHEETS}/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(a1(name, range))}`, query: { majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' } });
      const rows = (r.values ?? []).slice(0, maxRows).map((row) => row.map((v) => (v == null ? '' : String(v))));
      return { title: s.properties?.title ?? 'Spreadsheet', sheets: names, range: r.range ?? a1(name, range), rows, url: s.spreadsheetUrl ?? null };
    },
    async append(id, rows, { sheet }) {
      const s = await meta(id);
      const { sheet: name } = pickSheet(s, sheet);
      const r = await call<{ updates?: { updatedRows?: number } }>({
        method: 'POST',
        url: `${SHEETS}/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(a1(name))}:append`,
        query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
        json: { majorDimension: 'ROWS', values: rows.map((row) => row.map((v) => (v == null ? '' : v))) },
      });
      return { appended: r.updates?.updatedRows ?? rows.length, url: s.spreadsheetUrl ?? null };
    },
    async create({ title, sheets }): Promise<CloudFile> {
      const s = await call<Spreadsheet>({
        method: 'POST',
        url: `${SHEETS}/spreadsheets`,
        query: { fields: 'spreadsheetId,spreadsheetUrl,properties.title' },
        json: {
          properties: { title },
          sheets: sheets.map((sh) => ({
            properties: { title: sh.name, gridProperties: { frozenRowCount: sh.rows.length > 1 ? 1 : 0 } },
            data: [{ startRow: 0, startColumn: 0, rowData: sh.rows.map((row) => ({ values: row.map((v) => ({ userEnteredValue: cellValue(v) })) })) }],
          })),
        },
      });
      return { id: s.spreadsheetId ?? '', name: s.properties?.title ?? title, mime: GOOGLE_SHEET, kind: 'spreadsheet', sizeBytes: null, modifiedAt: new Date().toISOString(), url: s.spreadsheetUrl ?? null };
    },
  };
}
