'use client';

import { useEffect, useSyncExternalStore } from 'react';

/* Which papers are on the user's shelf, shared by every Save button on the
   page. Buttons ask for their paper; unknown IDs are looked up together in one
   request a moment later. A paper is "saved" (its item ID), "unsaved" (null) or
   not known yet (undefined). */

const known = new Map<string, string | null>();
const listeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());

async function flush() {
  timer = null;
  const ids = [...queue];
  queue = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    try {
      const res = await fetch(`/api/shelf/saved?ids=${batch.map(encodeURIComponent).join(',')}`, { cache: 'no-store' });
      if (!res.ok) continue; // stays unknown; the button still offers Save
      const { saved } = (await res.json()) as { saved: Record<string, string> };
      for (const id of batch) known.set(id, saved[id] ?? null);
    } catch {
      /* offline: leave unknown */
    }
  }
  emit();
}

function request(id: string) {
  if (known.has(id) || queue.has(id)) return;
  queue.add(id);
  timer ??= setTimeout(flush, 40);
}

export function markSaved(paperId: string, itemId: string | null) {
  known.set(paperId, itemId);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* The shelf item ID for this paper, null when not saved, undefined while checking. */
export function useSavedItem(paperId: string | null): string | null | undefined {
  useEffect(() => {
    if (paperId) request(paperId);
  }, [paperId]);
  return useSyncExternalStore(
    subscribe,
    () => (paperId ? known.get(paperId) : null),
    () => undefined,
  );
}
