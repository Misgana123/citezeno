import type { RefItemInput } from '@/lib/providers/connectors/types';
import { CSV_COLUMNS, rowValues } from '@/lib/shelf/export/csv';
import type { ExportRow } from '@/lib/shelf/export/types';
import type { CapabilityOpener } from '../access';
import { ConnectorError } from '../errors';

/* Sending shelf papers to a connected app: a new spreadsheet, rows in a notes
   database, or references in a reference manager's collection. */

/* The most papers one send may carry. */
export const SEND_MAX = 1000;

export type SendTarget =
  | { to: 'sheets'; title: string }
  | { to: 'pages'; databaseId: string }
  | { to: 'references'; libraryId: string; collectionKey?: string | null; newCollection?: string | null };

export type SendResult = { app: string; sent: number; failed: number; url: string | null; where: string };

const today = () => new Date().toISOString().slice(0, 10);

export function toReference({ item, tags }: ExportRow): RefItemInput {
  const p = item.paper;
  return {
    type: p.type ?? 'article',
    title: p.title,
    authors: p.authors.map((a) => a.name),
    year: p.year,
    source: p.source,
    doi: p.doi,
    url: p.landingUrl ?? (p.doi ? `https://doi.org/${p.doi}` : null),
    abstract: p.abstract,
    tags,
  };
}

/* A notes-database row: values by the shelf's column names; lists stay lists. */
export function toNotesRow(r: ExportRow): Record<string, string | number | boolean | null | string[]> {
  const v = rowValues(r);
  const row: Record<string, string | number | boolean | null | string[]> = Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, v[i]]));
  row.Authors = r.item.paper.authors.map((a) => a.name);
  row.Tags = r.tags;
  row.Projects = r.projects;
  row.Folders = r.folders;
  row['PDF files'] = r.item.pdfs.map((f) => f.fileName);
  return row;
}

export async function sendShelf(open: CapabilityOpener, rows: ExportRow[], target: SendTarget): Promise<SendResult> {
  if (!rows.length) throw new ConnectorError('bad_request', 'There are no papers to send.');
  if (rows.length > SEND_MAX) throw new ConnectorError('bad_request', `At most ${SEND_MAX.toLocaleString('en-US')} papers can be sent at once.`);

  if (target.to === 'sheets') {
    const { api, label } = await open('sheets');
    const f = await api.create({ title: target.title || `Citezeno papers ${today()}`, sheets: [{ name: 'Papers', rows: [CSV_COLUMNS, ...rows.map(rowValues)] }] });
    return { app: label, sent: rows.length, failed: 0, url: f.url, where: f.name };
  }

  if (target.to === 'pages') {
    const { api, label } = await open('pages');
    const { title } = await api.columns(target.databaseId);
    const r = await api.addRows(target.databaseId, rows.map(toNotesRow));
    return { app: label, sent: r.added, failed: rows.length - r.added, url: r.url, where: title };
  }

  const { api, label } = await open('references');
  let collectionKey = target.collectionKey ?? null;
  let where = 'the library';
  if (target.newCollection?.trim()) {
    const c = await api.createCollection(target.libraryId, target.newCollection.trim());
    collectionKey = c.key;
    where = c.name;
  } else if (collectionKey) {
    where = (await api.collections(target.libraryId)).find((c) => c.key === collectionKey)?.name ?? 'the collection';
  }
  const r = await api.addItems(target.libraryId, rows.map(toReference), { collectionKey });
  return { app: label, sent: r.added, failed: r.failed, url: null, where };
}
