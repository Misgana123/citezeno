import { toRows } from '@/lib/shelf/export/rows';
import type { ExportRow } from '@/lib/shelf/export/types';
import type { Db } from '@/lib/shelf/db';
import { listFolders } from '@/lib/shelf/store/folders';
import { listItems } from '@/lib/shelf/store/items';
import type { ListQuery } from '@/lib/shelf/store/list-query';
import { listProjects } from '@/lib/shelf/store/projects';
import { listTags } from '@/lib/shelf/store/tags';
import type { ShelfItem } from '@/lib/shelf/types';

/* Shelf papers to send to an app: the same listing and filters as the shelf
   page (and the assistant), with their projects, folders and tags named. */

const PAGE = 100;

export async function shelfRows(db: Db, userId: string, query: (page: number, perPage: number) => ListQuery, max: number): Promise<{ rows: ExportRow[]; total: number }> {
  const items: ShelfItem[] = [];
  let total = 0;
  for (let page = 1; items.length < max; page++) {
    const r = await listItems(db, userId, query(page, PAGE));
    total = r.total;
    items.push(...r.items);
    if (!r.items.length || items.length >= r.total) break;
  }
  const [projects, folders, tags] = await Promise.all([listProjects(db, userId), listFolders(db, userId), listTags(db, userId)]);
  return { rows: toRows(items.slice(0, max), { projects, folders, tags }), total };
}
