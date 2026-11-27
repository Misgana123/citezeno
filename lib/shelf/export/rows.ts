import { toBibtex } from './bibtex';
import { toCsv } from './csv';
import { toRis } from './ris';
import type { ExportFormat, ExportRow } from './types';
import type { ShelfItem } from '../types';

/* Shelf items → export rows (projects, folders and tags by name) → a file's
   text. Used by the shelf page (in the browser) and the research agent. */

type Named = { id: string; name: string };

export function toRows<P extends Named, F extends Named, T extends Named>(items: ShelfItem[], g: { projects: readonly P[]; folders: readonly F[]; tags: readonly T[] }): ExportRow[] {
  const name = (list: readonly Named[]) => new Map(list.map((x) => [x.id, x.name]));
  const projects = name(g.projects);
  const folders = name(g.folders);
  const tags = name(g.tags);
  const pick = (ids: string[], m: Map<string, string>) => ids.map((id) => m.get(id)).filter((x): x is string => !!x);
  return items.map((item) => ({ item, projects: pick(item.projectIds, projects), folders: pick(item.folderIds, folders), tags: pick(item.tagIds, tags) }));
}

export const writeFormat = (format: ExportFormat, rows: ExportRow[]) => (format === 'bibtex' ? toBibtex(rows) : format === 'ris' ? toRis(rows) : toCsv(rows));
