'use client';

/* The account-backed copy of the library. Signed-in users keep the browser
   library as a fast local cache; this module mirrors it to /api/traces. */
import type { Saved } from './library';

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
export const pushRemote = (s: Saved) => call<{ ok: true }>('/api/traces', { method: 'POST', body: JSON.stringify(s) });
export const deleteRemote = (id: string) => call<{ ok: true }>(`/api/traces/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* Upload browser entries the account lacks (or has older copies of), then return
   one merged list, newest first. Full local entries win over remote stubs. */
export async function syncLibrary(local: Saved[]): Promise<LibItem[]> {
  const remote = await listRemote();
  const byId = new Map<string, LibItem>(remote.map((r) => [r.id, r]));
  const uploads = local.filter((l) => {
    const r = byId.get(l.id);
    return !r || r.savedAt < l.savedAt;
  });
  await Promise.allSettled(uploads.map(pushRemote));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || r.savedAt <= l.savedAt) byId.set(l.id, l);
  }
  return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
}
