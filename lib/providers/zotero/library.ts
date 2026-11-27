import { randomBytes } from 'node:crypto';
import { ProviderError } from '../errors';
import type { WithHeaders } from '../connectors/http';
import type { RefCollection, RefLibrary, ReferenceLibrary } from '../connectors/types';
import type { KeyInfo } from './auth';
import { PROVIDER, type ZoteroCall } from './http';
import { fromZotero, SKIPPED_TYPES, toZotero, type ZoteroItem } from './map';

/* A user's Zotero libraries: their own ("user") and their groups ("group:123"). */

/* Zotero's most per request, for reading and for writing. */
const READ_MAX = 100;
const WRITE_MAX = 50;

type ZCollection = { key: string; data: { name?: string; parentCollection?: string | false }; meta?: { numItems?: number } };
type ZGroup = { id: number; data?: { name?: string } };
type WriteResult = { successful?: Record<string, { key?: string }>; success?: Record<string, string>; unchanged?: Record<string, string>; failed?: Record<string, { code?: number; message?: string }> };

export function libraryPath(libraryId: string, userId: number): string {
  if (libraryId === 'user') return `/users/${userId}`;
  const m = /^group:(\d{1,12})$/.exec(libraryId);
  if (!m) throw new ProviderError('bad_request', 'That isn’t a Zotero library.', { provider: PROVIDER });
  return `/groups/${m[1]}`;
}

const collectionKey = (k: string) => {
  if (!/^[A-Z0-9]{8}$/.test(k)) throw new ProviderError('bad_request', 'That isn’t a Zotero collection.', { provider: PROVIDER });
  return k;
};

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function zoteroLibrary(call: ZoteroCall, userId: number, key: string): ReferenceLibrary {
  const path = (id: string) => libraryPath(id, userId);
  const writeToken = () => randomBytes(16).toString('hex');

  return {
    async libraries(): Promise<RefLibrary[]> {
      const info = await call<KeyInfo>({ method: 'GET', path: `/keys/${encodeURIComponent(key)}` });
      const out: RefLibrary[] = [];
      if (info.access?.user?.library) out.push({ id: 'user', name: 'My Library', kind: 'user', canWrite: !!info.access.user.write });
      const groups = info.access?.groups ?? {};
      if (Object.keys(groups).length) {
        const list = await call<ZGroup[]>({ method: 'GET', path: `/users/${userId}/groups`, query: { limit: READ_MAX } });
        for (const g of list) {
          const access = groups[String(g.id)] ?? groups.all;
          if (access?.library) out.push({ id: `group:${g.id}`, name: g.data?.name ?? `Group ${g.id}`, kind: 'group', canWrite: !!access.write });
        }
      }
      return out;
    },

    async collections(libraryId) {
      const out: RefCollection[] = [];
      for (let start = 0; start < 5000; start += READ_MAX) {
        const r = await call<WithHeaders<ZCollection[]>>({ method: 'GET', path: `${path(libraryId)}/collections`, query: { limit: READ_MAX, start }, expect: 'json+headers' });
        out.push(...r.data.map((c) => ({ key: c.key, name: c.data.name ?? 'Untitled', parentKey: c.data.parentCollection || null, items: c.meta?.numItems ?? null })));
        if (r.data.length < READ_MAX || out.length >= int(r.headers['total-results'], out.length)) break;
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    async items(libraryId, { collectionKey: col, since, start, limit }) {
      const where = col ? `${path(libraryId)}/collections/${collectionKey(col)}/items/top` : `${path(libraryId)}/items/top`;
      const r = await call<WithHeaders<ZoteroItem[]>>({
        method: 'GET',
        path: where,
        query: { format: 'json', limit: Math.min(READ_MAX, Math.max(1, limit)), start, sort: 'dateModified', direction: 'asc', ...(since ? { since } : {}) },
        expect: 'json+headers',
      });
      return {
        items: r.data.filter((it) => !SKIPPED_TYPES.has(it.data.itemType ?? '')).map(fromZotero),
        // a page's worth of notes or attachments left out still counts toward where the next page starts
        total: int(r.headers['total-results'], r.data.length),
        version: int(r.headers['last-modified-version'], 0),
      };
    },

    async search(libraryId, query, limit) {
      const r = await call<ZoteroItem[]>({ method: 'GET', path: `${path(libraryId)}/items/top`, query: { format: 'json', q: query, qmode: 'titleCreatorYear', limit: Math.min(READ_MAX, Math.max(1, limit)) } });
      return r.filter((it) => !SKIPPED_TYPES.has(it.data.itemType ?? '')).map(fromZotero);
    },

    async createCollection(libraryId, name) {
      const r = await call<WriteResult>({ method: 'POST', path: `${path(libraryId)}/collections`, headers: { 'zotero-write-token': writeToken() }, json: [{ name: name.slice(0, 200), parentCollection: false }] });
      const k = r.successful?.['0']?.key ?? r.success?.['0'];
      if (!k) throw new ProviderError('bad_request', `Zotero didn’t make the collection${r.failed?.['0']?.message ? `: ${r.failed['0'].message}` : '.'}`, { provider: PROVIDER });
      return { key: k, name, parentKey: null, items: 0 };
    },

    async addItems(libraryId, items, { collectionKey: col }) {
      const target = col ? collectionKey(col) : null;
      let added = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i += WRITE_MAX) {
        const batch = items.slice(i, i + WRITE_MAX).map((it) => toZotero(it, target));
        const r = await call<WriteResult>({ method: 'POST', path: `${path(libraryId)}/items`, headers: { 'zotero-write-token': writeToken() }, json: batch });
        added += Object.keys(r.successful ?? r.success ?? {}).length + Object.keys(r.unchanged ?? {}).length;
        failed += Object.keys(r.failed ?? {}).length;
      }
      return { added, failed };
    },
  };
}
