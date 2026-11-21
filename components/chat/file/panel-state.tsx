'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* The files open beside the assistant: which papers have a tab, which one is
   shown, and a passage to jump to once it has loaded. Any part of the chat
   (the paper rows, the passage links in an answer) opens a file through it. */

export type OpenFile = { paperId: string; title: string | null };
export type Jump = { paperId: string; passageId: string; key: number };

export type FilePanel = {
  files: OpenFile[];
  active: string | null;
  jump: Jump | null;
  /* open (or show) a paper, optionally jumping to one of its passages */
  open(paperId: string, opts?: { title?: string | null; passageId?: string }): void;
  select(paperId: string): void;
  close(paperId: string): void;
  closeAll(): void;
  /* the title once the paper has loaded (for its tab) */
  named(paperId: string, title: string): void;
  jumped(): void;
};

const Ctx = createContext<FilePanel | null>(null);
export const FilePanelProvider = Ctx.Provider;
/* null outside the assistant: callers then fall back to the reader page */
export const useFilePanel = () => useContext(Ctx);

/* Asks the app shell to fold the sidebar to its icons while a file is open
   (not remembered: it opens out again when the last file closes). */
export const RAIL_EVENT = 'citezeno:rail';
const rail = (on: boolean) => {
  window.dispatchEvent(new CustomEvent<boolean>(RAIL_EVENT, { detail: on }));
};

export function useFilePanelState(): FilePanel {
  const [state, setState] = useState<{ files: OpenFile[]; active: string | null }>({ files: [], active: null });
  const [jump, setJump] = useState<Jump | null>(null);

  const open = useCallback((paperId: string, opts: { title?: string | null; passageId?: string } = {}) => {
    setState((s) => ({ files: s.files.some((f) => f.paperId === paperId) ? s.files : [...s.files, { paperId, title: opts.title ?? null }], active: paperId }));
    setJump(opts.passageId ? { paperId, passageId: opts.passageId, key: Date.now() } : null);
  }, []);
  const select = useCallback((paperId: string) => setState((s) => ({ ...s, active: paperId })), []);
  const close = useCallback((paperId: string) => {
    setState((s) => {
      const files = s.files.filter((f) => f.paperId !== paperId);
      return { files, active: s.active === paperId ? (files.at(-1)?.paperId ?? null) : s.active };
    });
  }, []);
  const closeAll = useCallback(() => {
    setState({ files: [], active: null });
    setJump(null);
  }, []);
  const named = useCallback((paperId: string, title: string) => {
    setState((s) => (s.files.some((f) => f.paperId === paperId && f.title !== title) ? { ...s, files: s.files.map((f) => (f.paperId === paperId ? { ...f, title } : f)) } : s));
  }, []);
  const jumped = useCallback(() => setJump(null), []);

  const anyOpen = state.files.length > 0;
  useEffect(() => {
    rail(anyOpen);
  }, [anyOpen]);
  useEffect(() => () => rail(false), []);

  return useMemo(() => ({ files: state.files, active: state.active, jump, open, select, close, closeAll, named, jumped }), [state, jump, open, select, close, closeAll, named, jumped]);
}
