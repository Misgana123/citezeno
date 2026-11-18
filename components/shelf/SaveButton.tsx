'use client';

import { useEffect, useRef, useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import type { Project } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { ShelfApiError, shelfFetch, shelfItemHref } from './api';
import { savedToast } from './dup-hint';
import { markSaved, useSavedItem } from './saved-store';
import type { DupSummary } from '@/lib/shelf/api/saved-response';
import './save-button.css';

/* Save a Find Papers result to the shelf in one click (it goes to Unsorted),
   or pick a project from the arrow menu. Once saved, it shows "Saved" and
   links to the paper on the shelf, everywhere the paper appears. */
export function SaveButton({ paper, menuAlign = 'right' }: { paper: Paper; menuAlign?: 'left' | 'right' }) {
  const itemId = useSavedItem(paper.openalexId);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  if (itemId) {
    return (
      <a className="btn btn-ghost btn-sm sv-saved" href={shelfItemHref(itemId)} title="Open it on your shelf">
        <Icon name="check" /> Saved
      </a>
    );
  }

  const save = async (project?: Project) => {
    setMenu(false);
    setBusy(true);
    try {
      const r = await shelfFetch<{ item: { id: string }; pending: boolean; possibleDuplicates: DupSummary[] }>('/api/shelf/papers', {
        method: 'POST',
        body: { via: 'search', paperId: paper.openalexId, paper, projectId: project?.id ?? null },
      });
      markSaved(paper.openalexId, r.item.id);
      savedToast(project ? `Saved to ${project.name}` : 'Saved to your shelf', r.possibleDuplicates);
    } catch (e) {
      const err = e as ShelfApiError;
      if (err.code === 'duplicate' && err.itemId) {
        markSaved(paper.openalexId, err.itemId);
        toast('Already on your shelf');
      } else toast(err.message || 'Could not save this paper.', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="sv-save">
      <button type="button" className="btn btn-ghost btn-sm sv-main" onClick={() => save()} disabled={busy || itemId === undefined} aria-label={`Save “${paper.title}” to your shelf`}>
        {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" />} Save
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm sv-more"
        onClick={() => setMenu((m) => !m)}
        disabled={busy || itemId === undefined}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label="Save into a project"
      >
        <Icon name="chevron" />
      </button>
      {menu && <ProjectMenu align={menuAlign} onPick={save} onClose={() => setMenu(false)} />}
    </span>
  );
}

/* The user's projects, plus "New project". */
function ProjectMenu({ align, onPick, onClose }: { align: 'left' | 'right'; onPick: (p?: Project) => void; onClose: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    shelfFetch<{ projects: Project[] }>('/api/shelf/projects', { signal: ctrl.signal })
      .then((r) => setProjects(r.projects))
      .catch((e) => (e as Error).name !== 'AbortError' && setError((e as Error).message));
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      ctrl.abort();
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      onPick(await shelfFetch<Project>('/api/shelf/projects', { method: 'POST', body: { name } }));
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className={`umenu-pop sv-menu is-${align}`} role="menu" ref={box}>
      <p className="sv-menu-h">Save into</p>
      <button type="button" role="menuitem" onClick={() => onPick()}>
        <Icon name="layers" /> Unsorted
      </button>
      {projects === null && !error && <span className="spin sv-menu-spin" aria-label="Loading projects" />}
      {projects?.map((p) => (
        <button key={p.id} type="button" role="menuitem" onClick={() => onPick(p)}>
          <Icon name="book" /> <span className="sv-menu-name">{p.name}</span>
        </button>
      ))}
      {error && <p className="sv-menu-err">{error}</p>}
      <form className="sv-new" onSubmit={create}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New project" maxLength={80} aria-label="New project name" />
        <button type="submit" className="btn btn-thread btn-sm" disabled={creating || !name.trim()}>
          {creating ? <span className="spin" aria-hidden="true" /> : 'Add'}
        </button>
      </form>
    </div>
  );
}
