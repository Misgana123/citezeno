'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SkillCatalog } from '@/lib/skills/types';
import { loadSkills } from './api';

/* The user's skills, shared by the page (the + menu and Settings show the same list). */

let catalog: SkillCatalog | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function reloadSkills(): Promise<void> {
  loading ??= loadSkills()
    .then((c) => {
      catalog = c;
      emit();
    })
    .catch(() => {})
    .finally(() => (loading = null));
  return loading;
}

export function useSkills(load = true) {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => catalog,
    () => null,
  );
  useEffect(() => {
    if (load && !catalog) void reloadSkills();
  }, [load]);
  const reload = useCallback(() => reloadSkills(), []);
  return { catalog: value, reload };
}
