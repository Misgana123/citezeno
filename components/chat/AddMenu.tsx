'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@/lib/shelf/types';
import { openSettings } from '../settings/open';
import { shelfFetch } from '../shelf/api';
import { useSkills } from '../skills/useSkills';
import { useLab } from '../labs/useLab';
import { Icon } from '../Icon';
import { ATTACH_ACCEPT, canScreenshot } from './attach';

/* The + button in the message box. Its menu: upload files, take a screenshot,
   add a shelf project as context; Skills (a submenu with Manage and Browse);
   Research and Web search. */

export type Toggle = { on: boolean; onChange(on: boolean): void };
/* labId: a lab project (the chat becomes the project's) */
export type Picked = { id: string; name: string; labId?: string } | null;
export type Pick = { value: Picked; onChange(v: Picked): void };

type Props = {
  disabled?: boolean;
  /* opens downward (the home page) instead of up over the thread */
  down?: boolean;
  onAddFiles(files: File[]): void;
  onScreenshot(): void;
  web?: Toggle;
  research?: Toggle;
  skill?: Pick;
  project?: Pick;
};

type Sub = 'shelf' | 'skills' | null;

export function AddMenu({ disabled, down, onAddFiles, onScreenshot, web, research, skill, project }: Props) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub>(null);
  const [shots, setShots] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { catalog } = useSkills();
  // your projects, then your lab's (a lab project makes the chat the project's, shared with its people)
  const [projects, setProjects] = useState<(Project & { lab?: string; labId?: string })[] | null>(null);
  const { lab } = useLab();

  useEffect(() => setShots(canScreenshot()), []);
  useEffect(() => {
    if (!open) return setSub(null);
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  // Ctrl+U adds files, as the menu says
  useEffect(() => {
    if (disabled) return;
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        setOpen(false);
        input.current?.click();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [disabled]);
  // the shelf's projects (yours, then your labs'), when that submenu opens and again once your labs are known
  const labs = useMemo(() => [...(lab?.lab && lab.role !== 'guest' ? [{ id: lab.lab.id, name: lab.lab.name }] : []), ...(lab?.guestOf ?? [])], [lab]);
  const labsKey = labs.map((l) => l.id).join(',');
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (sub !== 'shelf' || (projects && loadedFor.current === labsKey)) return;
    loadedFor.current = labsKey;
    Promise.all([
      shelfFetch<{ projects: Project[] }>('/api/shelf/groups').then((g) => g.projects),
      ...labs.map((l) =>
        fetch('/api/shelf/groups', { cache: 'no-store', headers: { 'x-cz-space': `lab:${l.id}` } })
          .then((r) => (r.ok ? r.json() : { projects: [] }))
          .then((g: { projects?: Project[] }) => (g.projects ?? []).map((p) => ({ ...p, lab: l.name, labId: l.id }))),
      ),
    ])
      .then((lists) => loadedFor.current === labsKey && setProjects(lists.flat()))
      .catch(() => setProjects((p) => p ?? []));
  }, [sub, projects, labs, labsKey]);

  const done = (fn?: () => void) => {
    setOpen(false);
    fn?.();
  };

  const skills = catalog?.mine.filter((s) => s.enabled) ?? [];

  /* a row that opens a submenu beside it (hover, click, or → on the keyboard) */
  const subRow = (id: Exclude<Sub, null>, icon: Parameters<typeof Icon>[0]['name'], label: string, children: ReactNode) => (
    <div
      className={`ch-am-i${sub === id ? ' is-open' : ''}`}
      role="menuitem"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={sub === id}
      onMouseEnter={() => setSub(id)}
      onClick={(e) => (e.target as HTMLElement).closest('.ch-am-sub') == null && setSub(sub === id ? null : id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) {
          if (e.key === 'ArrowLeft') {
            setSub(null);
            e.currentTarget.focus();
          }
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const row = e.currentTarget;
          setSub(id);
          requestAnimationFrame(() => (row.querySelector('.ch-am-sub .ch-am-i') as HTMLElement | null)?.focus());
        }
      }}
    >
      <Icon name={icon} />
      {label}
      <span className="ch-am-end">
        <Icon name="chevron" className="ch-am-chev" />
      </span>
      {sub === id && (
        <div className="ch-am ch-am-sub" role="menu">
          {children}
        </div>
      )}
    </div>
  );
  const flat = () => setSub(null);

  return (
    <div className="ch-add-wrap" ref={box}>
      <button
        type="button"
        className="ch-add"
        aria-label="Add files, skills and more"
        title="Add files, skills and more"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className={`ch-am ch-am-main${down ? ' is-down' : ''}`} role="menu">
          <button type="button" className="ch-am-i" role="menuitem" onMouseEnter={flat} onClick={() => done(() => input.current?.click())}>
            <Icon name="clip" />
            Upload or add files
            <span className="ch-am-end">Ctrl+U</span>
          </button>
          {shots && (
            <button type="button" className="ch-am-i" role="menuitem" onMouseEnter={flat} onClick={() => done(onScreenshot)}>
              <Icon name="camera" />
              Take a screenshot
            </button>
          )}
          {project &&
            subRow(
              'shelf',
              'layers',
              'Add from shelf',
              projects == null ? (
                <div className="ch-am-note">Loading…</div>
              ) : projects.length === 0 ? (
                <div className="ch-am-note">No projects on your shelf yet.</div>
              ) : (
                projects.map((p) => (
                  <button key={p.id} type="button" className="ch-am-i" role="menuitemradio" aria-checked={project.value?.id === p.id} onClick={() => done(() => project.onChange(project.value?.id === p.id ? null : { id: p.id, name: p.name, ...(p.labId ? { labId: p.labId } : {}) }))}>
                    <Icon name={p.lab ? 'users' : 'folder'} />
                    <span className="ch-am-two">
                      {p.name}
                      <small>
                        {p.lab ? `${p.lab} · ` : ''}
                        {p.count.toLocaleString()} paper{p.count === 1 ? '' : 's'}
                      </small>
                    </span>
                    {project.value?.id === p.id && (
                      <span className="ch-am-end">
                        <Icon name="check" className="ch-am-tick" />
                      </span>
                    )}
                  </button>
                ))
              ),
            )}

          <div className="ch-am-sep" />

          {skill &&
            subRow(
              'skills',
              'skill',
              'Skills',
              <>
                {catalog == null ? (
                  <div className="ch-am-note">Loading…</div>
                ) : skills.length === 0 ? (
                  <div className="ch-am-note">No skills yet.</div>
                ) : (
                  skills.map((s) => (
                    <button key={s.id} type="button" className="ch-am-i" role="menuitemradio" aria-checked={skill.value?.id === s.id} title={s.description} onClick={() => done(() => skill.onChange(skill.value?.id === s.id ? null : { id: s.id, name: s.name }))}>
                      <Icon name={s.by === 'you' ? 'pencil' : s.by === 'lab' ? 'users' : 'skill'} />
                      {s.name}
                      {skill.value?.id === s.id && (
                        <span className="ch-am-end">
                          <Icon name="check" className="ch-am-tick" />
                        </span>
                      )}
                    </button>
                  ))
                )}
                <div className="ch-am-sep" />
                <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { view: 'yours' }))}>
                  <Icon name="briefcase" />
                  Manage skills
                </button>
                <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { view: 'discover' }))}>
                  <Icon name="plus" />
                  Browse skills
                </button>
              </>,
            )}

          {(research || web) && <div className="ch-am-sep" />}
          {research && (
            <button type="button" className="ch-am-i" role="menuitemcheckbox" aria-checked={research.on} onMouseEnter={flat} onClick={() => done(() => research.onChange(!research.on))}>
              <Icon name="research" />
              Research
              {research.on && (
                <span className="ch-am-end">
                  <Icon name="check" className="ch-am-tick" />
                </span>
              )}
            </button>
          )}
          {web && (
            <button type="button" className="ch-am-i" role="menuitemcheckbox" aria-checked={web.on} onMouseEnter={flat} onClick={() => done(() => web.onChange(!web.on))}>
              <Icon name="globe" />
              Web search
              {web.on && (
                <span className="ch-am-end">
                  <Icon name="check" className="ch-am-tick" />
                </span>
              )}
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ATTACH_ACCEPT}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onAddFiles(files);
        }}
      />
    </div>
  );
}
