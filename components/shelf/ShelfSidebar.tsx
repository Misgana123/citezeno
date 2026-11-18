'use client';

import { useCallback, useRef, useState } from 'react';
import type { Project } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { InlineName } from './InlineName';
import type { ShelfFilters } from './shelf-state';
import { useDismiss } from './useDismiss';
import type { GroupsApi } from './useShelfGroups';

export type ViewPick = Partial<Pick<ShelfFilters, 'project' | 'folder' | 'tag' | 'retracted' | 'dups'>>;

/* The shelf's views: all papers, Unsorted, each project (with its folders) and
   each tag. Projects, folders and tags are created, renamed and deleted here. */
export function ShelfSidebar({ open, groups, filters, onPick, onFiles }: { open: boolean; groups: GroupsApi; filters: ShelfFilters; onPick: (p: ViewPick) => void; onFiles: () => void }) {
  const [editing, setEditing] = useState<string | null>(null); // "new-project", "new-tag", "new-folder:<projectId>", "<id>"
  const go = (p: ViewPick) => onPick({ project: '', folder: '', tag: '', retracted: false, dups: false, ...p });
  const isAll = !filters.project && !filters.folder && !filters.tag && !filters.retracted && !filters.dups;
  const foldersOf = (projectId: string) => groups.folders.filter((f) => f.projectId === projectId);

  const removeProject = async (p: Project) => {
    if (!window.confirm(`Delete the project “${p.name}” and its folders? The papers stay on your shelf.`)) return;
    if ((await groups.deleteProject(p.id)) && filters.project === p.id) go({});
  };

  return (
    <nav id="sh-side" className={`sh-side${open ? ' is-open' : ''}`} aria-label="Shelf views">
      <ul className="sh-views">
        <ViewLink icon="layers" label="All papers" count={groups.counts.all} active={isAll} onClick={() => go({})} />
        <ViewLink icon="list" label="Unsorted" count={groups.counts.unsorted} active={filters.project === 'unsorted'} onClick={() => go({ project: 'unsorted' })} />
        {groups.counts.retracted > 0 && (
          <ViewLink icon="alert" label="Retracted" count={groups.counts.retracted} active={filters.retracted && !filters.project} onClick={() => go({ retracted: true })} warn />
        )}
        {(groups.counts.duplicates > 0 || filters.dups) && (
          <ViewLink icon="swap" label="Possible duplicates" count={groups.counts.duplicates} active={filters.dups} onClick={() => go({ dups: true })} />
        )}
      </ul>

      <div className="sh-side-sec">
        <div className="sh-side-h">
          <h2>Projects</h2>
          <button type="button" className="icon-btn sh-add" onClick={() => setEditing('new-project')} aria-label="New project" title="New project">
            <Icon name="plus" />
          </button>
        </div>
        <ul className="sh-views">
          {editing === 'new-project' && (
            <li>
              <InlineName placeholder="Project name" label="New project name" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.createProject(n)) && setEditing(null)} />
            </li>
          )}
          {groups.projects.map((p) => (
            <li key={p.id}>
              {editing === p.id ? (
                <InlineName initial={p.name} placeholder="Project name" label="Rename project" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.renameProject(p.id, n)) && setEditing(null)} />
              ) : (
                <ViewRow
                  icon="book"
                  label={p.name}
                  count={p.count}
                  active={filters.project === p.id && !filters.folder}
                  onClick={() => go({ project: p.id })}
                  menu={[
                    { label: 'New folder', run: () => setEditing(`new-folder:${p.id}`) },
                    { label: 'Rename', run: () => setEditing(p.id) },
                    { label: 'Delete', run: () => removeProject(p), danger: true },
                  ]}
                />
              )}
              {(foldersOf(p.id).length > 0 || editing === `new-folder:${p.id}`) && (
                <ul className="sh-views sh-folders">
                  {foldersOf(p.id).map((f) => (
                    <li key={f.id}>
                      {editing === f.id ? (
                        <InlineName initial={f.name} placeholder="Folder name" label="Rename folder" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.renameFolder(f.id, n)) && setEditing(null)} />
                      ) : (
                        <ViewRow
                          icon="chevron"
                          label={f.name}
                          count={f.count}
                          active={filters.folder === f.id}
                          onClick={() => go({ project: p.id, folder: f.id })}
                          menu={[
                            { label: 'Rename', run: () => setEditing(f.id) },
                            {
                              label: 'Delete',
                              danger: true,
                              run: async () => {
                                if (!window.confirm(`Delete the folder “${f.name}”? Its papers stay in ${p.name}.`)) return;
                                if ((await groups.deleteFolder(f.id)) && filters.folder === f.id) go({ project: p.id });
                              },
                            },
                          ]}
                        />
                      )}
                    </li>
                  ))}
                  {editing === `new-folder:${p.id}` && (
                    <li>
                      <InlineName placeholder="Folder name" label={`New folder in ${p.name}`} onCancel={() => setEditing(null)} onSave={async (n) => (await groups.createFolder(p.id, n)) && setEditing(null)} />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
          {groups.loaded && !groups.projects.length && editing !== 'new-project' && <li className="sh-side-empty">Group papers for a thesis, an essay or a course.</li>}
        </ul>
      </div>

      <div className="sh-side-sec">
        <div className="sh-side-h">
          <h2>Tags</h2>
          <button type="button" className="icon-btn sh-add" onClick={() => setEditing('new-tag')} aria-label="New tag" title="New tag">
            <Icon name="plus" />
          </button>
        </div>
        <ul className="sh-views">
          {editing === 'new-tag' && (
            <li>
              <InlineName placeholder="Tag name" label="New tag name" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.createTag(n)) && setEditing(null)} />
            </li>
          )}
          {groups.tags.map((t) => (
            <li key={t.id}>
              {editing === t.id ? (
                <InlineName initial={t.name} placeholder="Tag name" label="Rename tag" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.updateTag(t.id, { name: n })) && setEditing(null)} />
              ) : (
                <ViewRow
                  icon="tag"
                  label={`#${t.name}`}
                  count={t.count}
                  active={filters.tag === t.id}
                  onClick={() => go({ tag: t.id })}
                  menu={[
                    { label: 'Rename', run: () => setEditing(t.id) },
                    {
                      label: 'Delete',
                      danger: true,
                      run: async () => {
                        if (!window.confirm(`Delete the tag “${t.name}”? It is removed from every paper.`)) return;
                        if ((await groups.deleteTag(t.id)) && filters.tag === t.id) go({});
                      },
                    },
                  ]}
                />
              )}
            </li>
          ))}
          {groups.loaded && !groups.tags.length && editing !== 'new-tag' && <li className="sh-side-empty">Label papers “methods”, “important”…</li>}
        </ul>
      </div>
      <div className="sh-side-sec">
        <ul className="sh-views">
          <li>
            <button type="button" className="sh-view" onClick={onFiles}>
              <Icon name="pdf" />
              <span className="sh-view-name">Your PDFs</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

function ViewLink({ icon, label, count, active, onClick, warn = false }: { icon: 'layers' | 'list' | 'alert' | 'swap'; label: string; count: number; active: boolean; onClick: () => void; warn?: boolean }) {
  return (
    <li>
      <button type="button" className={`sh-view${warn ? ' is-warn' : ''}`} aria-current={active ? 'true' : undefined} onClick={onClick}>
        <Icon name={icon} />
        <span className="sh-view-name">{label}</span>
        <span className="sh-view-n">{formatCount(count)}</span>
      </button>
    </li>
  );
}

type MenuEntry = { label: string; run: () => void; danger?: boolean };

/* A project, folder or tag row: pick it, or open its small menu. */
function ViewRow({ icon, label, count, active, onClick, menu }: { icon: 'book' | 'chevron' | 'tag'; label: string; count: number; active: boolean; onClick: () => void; menu: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  return (
    <div className="sh-row" ref={box}>
      <button type="button" className="sh-view" aria-current={active ? 'true' : undefined} onClick={onClick} title={label}>
        <Icon name={icon} />
        <span className="sh-view-name">{label}</span>
        <span className="sh-view-n">{formatCount(count)}</span>
      </button>
      <button type="button" className="icon-btn sh-row-more" aria-label={`More for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="menu" />
      </button>
      {open && (
        <div className="umenu-pop sh-row-menu" role="menu">
          {menu.map((m) => (
            <button
              key={m.label}
              type="button"
              role="menuitem"
              className={m.danger ? 'is-danger' : undefined}
              onClick={() => {
                setOpen(false);
                m.run();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
