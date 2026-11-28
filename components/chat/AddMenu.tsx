'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '@/lib/shelf/types';
import { AppLogo } from '../connectors/AppLogo';
import { setAssistant, signInHref } from '../connectors/actions';
import { connectHref } from '../connectors/api';
import { pickCloudFiles } from '../connectors/pick';
import { useConnectors } from '../connectors/useConnectors';
import { logoFor } from '../settings/customize/cards';
import { openSettings } from '../settings/open';
import { shelfFetch } from '../shelf/api';
import { useSkills } from '../skills/useSkills';
import { toast } from '../toast';
import { Icon } from '../Icon';
import { ATTACH_ACCEPT, canScreenshot } from './attach';

/* The + button in the message box. Its menu: upload files, add from Google
   Drive, take a screenshot, add a shelf project as context; Skills and
   Connectors (each a submenu with Manage and Browse); Research and Web search. */

export type Toggle = { on: boolean; onChange(on: boolean): void };
export type Picked = { id: string; name: string } | null;
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

type Sub = 'shelf' | 'skills' | 'connectors' | null;

export function AddMenu({ disabled, down, onAddFiles, onScreenshot, web, research, skill, project }: Props) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub>(null);
  const [shots, setShots] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { connectors, forCapability } = useConnectors();
  const { catalog } = useSkills();
  const [projects, setProjects] = useState<Project[] | null>(null);

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
  // the shelf's projects, the first time that submenu opens
  useEffect(() => {
    if (sub !== 'shelf' || projects) return;
    shelfFetch<{ projects: Project[] }>('/api/shelf/groups')
      .then((g) => setProjects(g.projects))
      .catch(() => setProjects([]));
  }, [sub, projects]);

  const done = (fn?: () => void) => {
    setOpen(false);
    fn?.();
  };

  /* Drive (or whichever app gives cloud files): pick, then add each file as an upload would be */
  const drive = forCapability('files');
  const driveOn = drive?.connection?.status === 'ok';
  const addFromDrive = async () => {
    if (!drive) return;
    setOpen(false);
    try {
      const picked = await pickCloudFiles(drive.name, { multiple: true, title: 'Add files to the message' });
      const files = await Promise.all(
        picked.map(async (p) => {
          const res = await fetch('/api/connectors/files/download', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId: p.id }) });
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `“${p.name}” couldn’t be added.`);
          const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? p.name);
          return new File([await res.blob()], name, { type: res.headers.get('content-type') ?? p.mime });
        }),
      );
      if (files.length) onAddFiles(files);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const skills = catalog?.mine.filter((s) => s.enabled) ?? [];
  const apps = connectors?.filter((c) => c.connection) ?? [];

  /* a row that opens a submenu beside it (hover, click, or → on the keyboard) */
  const subRow = (id: Exclude<Sub, null>, icon: Parameters<typeof Icon>[0]['name'], label: string, children: ReactNode, wide = false) => (
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
        <div className={`ch-am ch-am-sub${wide ? ' is-wide' : ''}`} role="menu">
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
        aria-label="Add files, skills, connectors and more"
        title="Add files, skills, connectors and more"
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
          {drive && (
            <>
              <button type="button" className="ch-am-i" role="menuitem" onMouseEnter={flat} onClick={driveOn ? addFromDrive : () => drive.signIn && (window.location.href = connectHref(drive.name, window.location.pathname))}>
                <AppLogo app={logoFor(drive)} size={20} />
                <span className="ch-am-two">
                  Add from {drive.name === 'google' ? 'Google Drive' : drive.label}
                  <small>{driveOn ? drive.connection!.label : drive.connection ? 'Connect again' : 'Not connected'}</small>
                </span>
              </button>
              {!driveOn && drive.signIn && (
                <div className="ch-am-i is-indent" onMouseEnter={flat}>
                  Log in to {drive.name === 'google' ? 'Google Drive' : drive.label}
                  <span className="ch-am-end">
                    <a className="ch-am-pill" href={connectHref(drive.name, window.location.pathname)}>
                      Connect
                    </a>
                  </span>
                </div>
              )}
            </>
          )}
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
                  <button key={p.id} type="button" className="ch-am-i" role="menuitemradio" aria-checked={project.value?.id === p.id} onClick={() => done(() => project.onChange(project.value?.id === p.id ? null : { id: p.id, name: p.name }))}>
                    <Icon name="folder" />
                    <span className="ch-am-two">
                      {p.name}
                      <small>
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
                      <Icon name={s.by === 'you' ? 'pencil' : 'skill'} />
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
                <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { kind: 'skills', view: 'yours' }))}>
                  <Icon name="briefcase" />
                  Manage skills
                </button>
                <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { kind: 'skills', view: 'discover' }))}>
                  <Icon name="plus" />
                  Browse skills
                </button>
              </>,
            )}

          {subRow(
            'connectors',
            'apps',
            'Connectors',
            <>
              {connectors == null ? (
                <div className="ch-am-note">Loading…</div>
              ) : apps.length === 0 ? (
                <div className="ch-am-note">{connectors.length ? 'No apps connected yet.' : 'Connecting apps isn’t set up yet.'}</div>
              ) : (
                apps.map((c) =>
                  c.connection!.status === 'ok' ? (
                    <button key={c.name} type="button" className="ch-am-i" role="menuitemcheckbox" aria-checked={c.connection!.assistant} onClick={() => setAssistant(c, !c.connection!.assistant)}>
                      <AppLogo app={logoFor(c)} size={20} />
                      {c.label}
                      <span className="ch-am-end">
                        <span className={`ch-switch${c.connection!.assistant ? ' is-on' : ''}`} aria-hidden="true" />
                      </span>
                    </button>
                  ) : (
                    <div key={c.name} className="ch-am-i">
                      <AppLogo app={logoFor(c)} size={20} />
                      <span className="ch-am-two">
                        {c.label}
                        <small>Connect again</small>
                      </span>
                      {c.signIn && (
                        <span className="ch-am-end">
                          <a className="ch-am-pill" href={signInHref(c.name)}>
                            Connect
                          </a>
                        </span>
                      )}
                    </div>
                  ),
                )
              )}
              <div className="ch-am-sep" />
              <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { kind: 'connectors', view: 'yours' }))}>
                <Icon name="briefcase" />
                Manage connectors
              </button>
              <button type="button" className="ch-am-i" role="menuitem" onClick={() => done(() => openSettings('customize', { kind: 'connectors', view: 'discover' }))}>
                <Icon name="plus" />
                Browse connectors
              </button>
            </>,
            true,
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
