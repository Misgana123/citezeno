import { z } from 'zod';
import { writeFormat, toRows } from '@/lib/shelf/export/rows';
import { EXPORT_FILES, type ExportFormat } from '@/lib/shelf/export/types';
import { listItems } from '@/lib/shelf/store/items';
import type { ShelfItem } from '@/lib/shelf/types';
import { listFilters, listQuery, loadGroups } from './library';
import { defineTool } from './types';

/* Exporting saved papers as BibTeX, RIS or CSV: the same files as the shelf's
   Export menu, offered to the user as a download in the chat. */

/* Exports larger than this ask the user first; this many at most. */
export const EXPORT_CONFIRM_AT = 50;
export const EXPORT_MAX = 500;
const PAGE = 100;

const FORMATS = ['bibtex', 'ris', 'csv'] as const satisfies readonly ExportFormat[];

export const exportLibrary = defineTool({
  name: 'export_library',
  description: `Export saved papers as a BibTeX, RIS or CSV file the user can download: chosen itemIds, or everything matching the filters (the whole shelf with none). At most ${EXPORT_MAX} papers; more than ${EXPORT_CONFIRM_AT} asks the user first.`,
  input: z.object({ format: z.enum(FORMATS), itemIds: z.array(z.string().min(1).max(80)).max(EXPORT_MAX).optional(), ...listFilters }),
  kind: 'read',
  label: (i) => `Exporting ${EXPORT_FILES[i.format].label}`,
  async confirm(input, ctx) {
    const { total } = await listItems(ctx.db, ctx.userId, listQuery(input, 1, 1));
    return total > EXPORT_CONFIRM_AT ? `Export ${Math.min(total, EXPORT_MAX)} papers as ${EXPORT_FILES[input.format].label}?` : null;
  },
  async run(ctx, { format, ...f }) {
    const items: ShelfItem[] = [];
    let total = 0;
    for (let page = 1; items.length < EXPORT_MAX; page++) {
      const r = await listItems(ctx.db, ctx.userId, listQuery(f, page, PAGE))
      total = r.total;
      items.push(...r.items);
      if (!r.items.length || items.length >= r.total) break;
    }
    const kept = items.slice(0, EXPORT_MAX);
    const file = EXPORT_FILES[format];
    const name = `citezeno-${new Date().toISOString().slice(0, 10)}.${file.ext}`;
    return {
      result: { exported: kept.length, ...(total > kept.length ? { leftOut: total - kept.length } : {}), fileName: name },
      display: { file: { name, mime: file.mime, text: writeFormat(format, toRows(kept, await loadGroups(ctx))) } },
    };
  },
});

export const EXPORT_TOOLS = [exportLibrary];
