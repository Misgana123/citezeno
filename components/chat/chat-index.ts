'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { listChats, type ChatList } from './api';

/* The user's chats and the models they can pick, shared by the sidebar and
   the chat page so both show the same list. Loaded once, refreshed after
   anything that changes it. */

let index: ChatList | null = null;
let error: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshChats(): Promise<void> {
  loading ??= listChats()
    .then((l) => {
      index = l;
      error = null;
    })
    .catch((e) => {
      error = (e as Error).message;
    })
    .finally(() => {
      loading = null;
      emit();
    });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Snap = { index: ChatList | null; error: string | null };
let snapshot: Snap = { index, error };
const read = () => (snapshot.index === index && snapshot.error === error ? snapshot : (snapshot = { index, error }));
const server: Snap = { index: null, error: null };

export function useChatIndex(): { index: ChatList | null; error: string | null } {
  const s = useSyncExternalStore(subscribe, read, () => server);
  useEffect(() => {
    if (!index && !loading) refreshChats();
  }, []);
  return s;
}
