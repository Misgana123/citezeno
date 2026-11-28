'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { LabView } from '@/lib/labs/types';
import { loadLab } from './api';

/* The user's lab, shared by the page (Settings, the shelf's lab switch, the + menu). */

let lab: LabView | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function reloadLab(): Promise<void> {
  loading ??= loadLab()
    .then((v) => {
      lab = v;
      emit();
    })
    .catch(() => {})
    .finally(() => (loading = null));
  return loading;
}

export function setLab(v: LabView) {
  lab = v;
  emit();
}

export function useLab(load = true) {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lab,
    () => null,
  );
  useEffect(() => {
    if (load && !lab) void reloadLab();
  }, [load]);
  return { lab: value, reload: useCallback(() => reloadLab(), []) };
}
