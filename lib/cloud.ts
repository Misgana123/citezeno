'use client';

/* The account-backed copy of the library. Signed-in users keep the browser
   library as a fast local cache; this module mirrors it to /api/traces. */
import { removeEntry, type Saved } from './library';

/* Ids this browser has already uploaded. If one later disappears from the
   account it was deleted elsewhere (say, on the library page), so the browser
   copy is dropped instead of being uploaded again. */
const SYNCED = 'cz:synced';
function syncedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SYNCED) || '[]'));
  } catch {
    return new Set();
  }
}
function markSynced(ids: string[]) {
  try {
    const s = syncedIds();
    ids.forEach((id) => s.add(id));
    localStorage.setItem(SYNCED, JSON.stringify([...s].slice(-500)));
  } catch {
    /* storage unavailable */
  }
}

/* A library row. Rows that only exist in the account arrive without `result`
   (and with a short draft snippet) until they are opened. */
export type LibItem = Omit<Saved, 'result'> & { result?: Saved['result'] };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

type Row = Omit<LibItem, 'draft' | 'result'> & { snippet: string };
export const listRemote = () =>
  call<{ items: Row[] }>('/api/traces').then((r) => r.items.map(({ snippet, ...x }): LibItem => ({ ...x, draft: snippet })));
export const fetchRemote = (id: string) => call<Saved>(`/api/traces/${encodeURIComponent(id)}`);
export const pushRemote = (s: Saved) =>
  call<{ ok: true }>('/api/traces', { method: 'POST', body: JSON.stringify(s) }).then((r) => {
    markSynced([s.id]);
    return r;
  });
export const deleteRemote = (id: string) => call<{ ok: true }>(`/api/traces/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* Upload browser entries the account lacks (or has older copies of), then return
   one merged list, newest first. Full local entries win over remote stubs. */
export async function syncLibrary(local: Saved[]): Promise<LibItem[]> {
  const remote = await listRemote();
  const byId = new Map<string, LibItem>(remote.map((r) => [r.id, r]));
  const synced = syncedIds();
  const deletedElsewhere = local.filter((l) => !byId.has(l.id) && synced.has(l.id));
  deletedElsewhere.forEach((l) => removeEntry(l.id));
  const keep = local.filter((l) => !deletedElsewhere.includes(l));
  const uploads = keep.filter((l) => {
    const r = byId.get(l.id);
    return !r || r.savedAt < l.savedAt;
  });
  await Promise.allSettled(uploads.map(pushRemote));
  markSynced(remote.map((r) => r.id));
  for (const l of keep) {
    const r = byId.get(l.id);
    // the account's title wins: it may have been renamed on the library page
    if (!r || r.savedAt <= l.savedAt) byId.set(l.id, r ? { ...l, title: r.title } : l);
  }
  return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
}
