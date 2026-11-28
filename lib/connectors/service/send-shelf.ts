import type { RefItemInput } from '@/lib/providers/connectors/types';
import { CSV_COLUMNS, rowValues } from '@/lib/shelf/export/csv';
import type { ExportRow } from '@/lib/shelf/export/types';
import type { CapabilityOpener } from '../access';
import { ConnectorError } from '../errors';

/* Sending shelf papers to a connected app: a new spreadsheet, rows in a notes
   database, references in a reference manager's collection, or a reading
   list of tasks (one per paper). */

/* The most papers one send may carry. */
export const SEND_MAX = 1000;

export type SendTarget =
  | { to: 'sheets'; title: string }
  | { to: 'pages'; databaseId: string }
  | { to: 'references'; libraryId: string; collectionKey?: string | null; newCollection?: string | null }
  | { to: 'tasks'; app?: string | null; projectId?: string | null };

/* The most tasks one send makes (one call each). */
export const TASKS_MAX = 100;

/* A reading-list task for one paper: "Read: Title (2021)", with who, where and its link. */
export function toReadingTask({ item }: ExportRow): { title: string; notes: string } {
  const p = item.paper;
  const authors = p.authors.slice(0, 3).map((a) => a.name).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
  const link = p.doi ? `https://doi.org/${p.doi}` : p.landingUrl;
  return { title: `Read: ${(p.title ?? 'Untitled').slice(0, 250)}${p.year ? ` (${p.year})` : ''}`, notes: [authors, p.source, link].filter(Boolean).join('\n') };
}

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

  if (target.to === 'tasks') {
    if (rows.length > TASKS_MAX) throw new ConnectorError('bad_request', `At most ${TASKS_MAX} papers can become tasks at once. Choose fewer papers.`);
    const { api, label } = await open('tasks', target.app);
    const where = target.projectId ? ((await api.projects()).find((p) => p.id === target.projectId)?.name ?? `the ${api.listName}`) : `your default ${api.listName}`;
    let sent = 0;
    for (const r of rows) {
      await api.create({ projectId: target.projectId ?? null, ...toReadingTask(r) });
      sent++;
    }
    return { app: label, sent, failed: rows.length - sent, url: null, where };
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
