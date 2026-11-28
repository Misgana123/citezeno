'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/shelf/types';
import { apiFetch } from '../api-fetch';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { useLab } from './useLab';

/* In the selection bar of your own shelf: copy the chosen papers into one of
   your lab's projects (shown only while you're a member of a lab). */
export function CopyToLab({ itemIds, onDone }: { itemIds: string[]; onDone?(): void }) {
  const { lab } = useLab();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const labId = lab?.lab?.id;

  useEffect(() => {
    if (!open || !labId) return;
    fetch('/api/shelf/groups', { cache: 'no-store', headers: { 'x-cz-space': `lab:${labId}` } })
      .then((r) => r.json())
      .then((g: { projects?: Project[] }) => setProjects(g.projects ?? []))
      .catch(() => setProjects([]));
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, labId]);

  if (!labId || lab?.role === 'guest') return null;
  const copy = async (p: Project) => {
    setBusy(true);
    try {
      const r = await apiFetch<{ copied: number; already: number }>('/api/labs/copy', { method: 'POST', body: { itemIds, projectId: p.id } });
      toast(`${r.copied} paper${r.copied === 1 ? '' : 's'} copied to ${p.name}${r.already ? ` (${r.already} already in the lab)` : ''}`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sh-copylab" ref={box}>
      <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="users" /> Copy to lab
      </button>
      {open && (
        <div className="cz-menu sh-copylab-pop" role="menu">
          <p className="cz-note">Copy to a project in {lab?.lab?.name}:</p>
          {projects == null ? (
            <p className="cz-note">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="cz-note">The lab has no projects yet. Make one on the lab’s shelf.</p>
          ) : (
            projects.map((p) => (
              <button key={p.id} type="button" role="menuitem" disabled={busy} onClick={() => copy(p)}>
                <Icon name="folder" /> {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
