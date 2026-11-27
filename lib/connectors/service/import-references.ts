import type { RefItem } from '@/lib/providers/connectors/types';
import type { ShelfConfig } from '@/lib/shelf/config';
import type { Db } from '@/lib/shelf/db';
import { ShelfError } from '@/lib/shelf/errors';
import type { ImportEntry, ParsedFile } from '@/lib/shelf/import/types';
import { queueImport } from '@/lib/shelf/service/import-start';
import type { CapabilityOpener } from '../access';
import { getSync, saveSync } from '../store';

/* A library or collection from a connected reference manager onto the shelf,
   through the shelf's own import: papers with a DOI get their details from
   OpenAlex, the rest are kept as written, papers already there are skipped.
   "Sync now" asks only for what changed since the last import of the same
   library or collection, into the same project. */

const PAGE = 100;

export type ImportOutcome = { importId: string | null; found: number; app: string; since: number | null };

export function toEntry(r: RefItem): ImportEntry {
  return {
    label: (r.title ?? r.key).split(/\s+/).slice(0, 8).join(' ').slice(0, 120),
    title: r.title,
    authors: r.authors,
    year: r.year,
    source: r.source,
    doi: r.doi,
    url: r.url,
    type: r.type === 'other' ? null : r.type,
    abstract: r.abstract,
  };
}

export const syncScope = (libraryId: string, collectionKey: string | null | undefined) => `${libraryId}:${collectionKey || '*'}`;

export async function importReferences(
  open: CapabilityOpener,
  shelf: { db: Db; config: ShelfConfig },
  userId: string,
  o: { libraryId: string; collectionKey?: string | null; name: string; projectId?: string | null; newProject?: string | null; sync?: boolean },
): Promise<ImportOutcome> {
  const { api, connector, label } = await open('references');
  const scope = syncScope(o.libraryId, o.collectionKey);
  const last = o.sync ? await getSync(shelf.db, userId, connector, scope) : null;
  const since = last?.version || undefined;

  const items: RefItem[] = [];
  let version = last?.version ?? 0;
  for (let start = 0; ; start += PAGE) {
    const r = await api.items(o.libraryId, { collectionKey: o.collectionKey, since, start, limit: PAGE });
    items.push(...r.items);
    version = Math.max(version, r.version);
    if (items.length > shelf.config.importMaxEntries) {
      throw new ShelfError('too_large', `This has over ${shelf.config.importMaxEntries.toLocaleString('en-US')} references, more than one import may bring in. Import a collection at a time.`);
    }
    if (start + PAGE >= r.total) break;
  }

  // a sync goes on into the project the first import chose, unless another is picked now
  const projectId = o.projectId ?? (o.newProject ? null : (last?.projectId ?? null));
  if (!items.length) {
    await saveSync(shelf.db, userId, connector, scope, { version, projectId });
    return { importId: null, found: 0, app: label, since: since ?? null };
  }
  const parsed: ParsedFile = {
    format: 'zotero',
    entries: items.filter((i) => i.title).map(toEntry),
    failed: items.filter((i) => !i.title).map((i) => ({ label: i.key, reason: 'No title' })),
  };
  const importId = await queueImport(shelf.db, shelf.config, userId, { fileName: `${label}: ${o.name}`.slice(0, 300), projectId, newProject: o.newProject, parsed });
  // the project the papers went into, so the next sync goes there too
  const { rows } = await shelf.db.query<{ projectId: string | null }>(`select "projectId" from shelf_import where id = $1`, [importId]);
  await saveSync(shelf.db, userId, connector, scope, { version, projectId: rows[0]?.projectId ?? projectId });
  return { importId, found: items.length, app: label, since: since ?? null };
}
