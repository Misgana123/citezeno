'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Capability } from '@/lib/providers/connectors/types';
import { listConnectors } from './api';

/* The apps a page can offer, and which are connected: one list for the whole
   page, so the chat's + menu and Settings always agree. */

let list: ConnectorView[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function reloadConnectors(): Promise<void> {
  loading ??= listConnectors()
    .then((c) => (list = c))
    .catch(() => (list = list ?? []))
    .then(emit)
    .finally(() => (loading = null));
  return loading;
}

/* Change the list here at once (a switch flipped), before the server answers. */
export function patchConnector(name: string, fn: (c: ConnectorView) => ConnectorView) {
  if (!list) return;
  list = list.map((c) => (c.name === name ? fn(c) : c));
  emit();
}

export function useConnectors(load = true) {
  const connectors = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
    () => null,
  );
  useEffect(() => {
    if (load && !list) void reloadConnectors();
  }, [load]);
  const reload = useCallback(() => {
    void reloadConnectors();
  }, []);
  const find = (name: string) => connectors?.find((c) => c.name === name) ?? null;
  const connected = (name: string) => find(name)?.connection?.status === 'ok';
  /* the first app that can do this (connected ones first) */
  const forCapability = (cap: Capability) => {
    const able = connectors?.filter((c) => c.capabilities.includes(cap)) ?? [];
    return able.find((c) => c.connection?.status === 'ok') ?? able[0] ?? null;
  };
  return { connectors, find, connected, forCapability, reload };
}
