import type { ExportRow } from './types';

/* CSV for spreadsheets: one paper per row. Values a spreadsheet would run as a
   formula (=, +, -, @ at the start) are prefixed with ' so they stay text. */

const STATUS = { to_read: 'To read', reading: 'Reading', done: 'Done' } as const;

export function csvCell(v: string | number | boolean | null | undefined): string {
  let s = v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = ['Title', 'Authors', 'Year', 'Source', 'Type', 'DOI', 'Link', 'Paper ID', 'Citations', 'Open access', 'Retracted', 'Reading status', 'Added', 'Projects', 'Folders', 'Tags', 'Note', 'PDF files'];

export function toCsv(rows: ExportRow[]): string {
  const lines = rows.map(({ item, projects, folders, tags }) => {
    const p = item.paper;
    return [
      p.title,
      p.authors.map((a) => a.name).join('; '),
      p.year,
      p.source,
      p.type,
      p.doi,
      p.landingUrl ?? (p.doi ? `https://doi.org/${p.doi}` : ''),
      p.provider ? p.id : '',
      p.origin === 'provider' ? p.citedByCount : '',
      p.isOpenAccess,
      p.isRetracted,
      STATUS[item.readingStatus],
      item.addedAt.slice(0, 10),
      projects.join('; '),
      folders.join('; '),
      tags.join('; '),
      item.note,
      item.pdfs.map((f) => f.fileName).join('; '),
    ]
      .map(csvCell)
      .join(',');
  });
  // the byte-order mark makes Excel read the file as UTF-8
  return `\uFEFF${[CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
