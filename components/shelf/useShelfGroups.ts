'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ShelfCounts } from '@/lib/shelf/store/counts';
import type { Folder, Project, Tag } from '@/lib/shelf/types';
import { toast } from '../toast';
import { shelfFetch } from './api';

/* The user's projects, folders, tags and totals, for the sidebar and pickers,
   with the calls that change them. Every change reloads the lot (they are small). */

export type Groups = { projects: Project[]; folders: Folder[]; tags: Tag[]; counts: ShelfCounts & { duplicates: number } };

const EMPTY: Groups = { projects: [], folders: [], tags: [], counts: { all: 0, library: 0, uploads: 0, unsorted: 0, retracted: 0, duplicates: 0 } };

export type GroupsApi = Groups & {
  loaded: boolean;
  reload(): Promise<void>;
  createProject(name: string): Promise<Project | null>;
  renameProject(id: string, name: string): Promise<boolean>;
  deleteProject(id: string): Promise<boolean>;
  createFolder(projectId: string, name: string): Promise<Folder | null>;
  renameFolder(id: string, name: string): Promise<boolean>;
  deleteFolder(id: string): Promise<boolean>;
  createTag(name: string, color?: string | null): Promise<Tag | null>;
  updateTag(id: string, patch: { name?: string; color?: string | null }): Promise<boolean>;
  deleteTag(id: string): Promise<boolean>;
};

export function useShelfGroups(): GroupsApi {
  const [groups, setGroups] = useState<Groups>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setGroups(await shelfFetch<Groups>('/api/shelf/groups'));
      setLoaded(true);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* Run a change, then reload; errors become a toast and a null / false result. */
  const change = useCallback(
    async <T,>(url: string, method: string, body?: unknown): Promise<T | null> => {
      try {
        const out = await shelfFetch<T>(url, { method, body });
        await reload();
        return out ?? ({} as T);
      } catch (e) {
        toast((e as Error).message, true);
        return null;
      }
    },
    [reload],
  );

  return {
    ...groups,
    loaded,
    reload,
    createProject: (name) => change<Project>('/api/shelf/projects', 'POST', { name }),
    renameProject: async (id, name) => !!(await change(`/api/shelf/projects/${id}`, 'PATCH', { name })),
    deleteProject: async (id) => !!(await change(`/api/shelf/projects/${id}`, 'DELETE')),
    createFolder: (projectId, name) => change<Folder>('/api/shelf/folders', 'POST', { projectId, name }),
    renameFolder: async (id, name) => !!(await change(`/api/shelf/folders/${id}`, 'PATCH', { name })),
    deleteFolder: async (id) => !!(await change(`/api/shelf/folders/${id}`, 'DELETE')),
    createTag: (name, color = null) => change<Tag>('/api/shelf/tags', 'POST', { name, color }),
    updateTag: async (id, patch) => !!(await change(`/api/shelf/tags/${id}`, 'PATCH', patch)),
    deleteTag: async (id) => !!(await change(`/api/shelf/tags/${id}`, 'DELETE')),
  };
}
