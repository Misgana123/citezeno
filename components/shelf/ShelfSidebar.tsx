'use client';

import { ProjectShare } from '../labs/ProjectShare';
import { useLab } from '../labs/useLab';
import { shelfSpace } from './api';

import { useCallback, useRef, useState } from 'react';
import type { Project } from '@/lib/shelf/types';
import { confirmDialog } from '../confirm';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { CollectionNav } from './CollectionNav';
import { InlineName } from './InlineName';
import type { ShelfFilters } from './shelf-state';
import { useDismiss } from './useDismiss';
import type { GroupsApi } from './useShelfGroups';

export type ViewPick = Partial<Pick<ShelfFilters, 'collection' | 'project' | 'folder' | 'tag' | 'retracted' | 'dups'>>;

/* The shelf's views: the two collections (Library, My uploads), then Unsorted,
   each project (with its folders) and each tag, which narrow the collection
   picked. Projects, folders and tags are created, renamed and deleted here. */
export function ShelfSidebar({ open, groups, filters, onPick, top }: { open: boolean; groups: GroupsApi; filters: ShelfFilters; onPick: (p: ViewPick) => void; /* the lab switch, above the collections */ top?: React.ReactNode }) {
  const [editing, setEditing] = useState<string | null>(null); // "new-project", "new-tag", "new-folder:<projectId>", "<id>"
  // a lab project shared with guests (lab owner and admins, on the lab's shelf)
  const [sharing, setSharing] = useState<Project | null>(null);
  const { lab } = useLab();
  const canShare = !!shelfSpace() && (lab?.role === 'owner' || lab?.role === 'admin') && shelfSpace() === `lab:${lab?.lab?.id}`;
  // picking a view keeps the collection unless it names one
  const go = (p: ViewPick) => onPick({ project: '', folder: '', tag: '', retracted: false, dups: false, ...p });
  const foldersOf = (projectId: string) => groups.folders.filter((f) => f.projectId === projectId);

  const removeProject = async (p: Project) => {
    const ok = await confirmDialog({ title: `Delete the project “${p.name}”?`, body: 'Its folders are deleted too. The papers stay on your shelf.', confirmLabel: 'Delete project', danger: true });
    if (!ok) return;
    if ((await groups.deleteProject(p.id)) && filters.project === p.id) go({});
  };

  return (
    <nav id="sh-side" className={`sh-side${open ? ' is-open' : ''}`} aria-label="Shelf views">
      {top}
      {sharing && <ProjectShare projectId={sharing.id} name={sharing.name} onClose={() => setSharing(null)} />}
      <div className="sh-side-sec">
        <h2 className="sh-side-label">Collections</h2>
        <CollectionNav current={filters.dups ? null : filters.collection} counts={groups.counts} onPick={(collection) => go({ collection })} />
        {(groups.counts.duplicates > 0 || filters.dups) && (
          <ul className="sh-views sh-views-extra">
            <ViewLink icon="swap" label="Possible duplicates" count={groups.counts.duplicates} active={filters.dups} onClick={() => go({ dups: true })} />
          </ul>
        )}
      </div>

      <div className="sh-side-sec">
        <div className="sh-side-h">
          <h2 className="sh-side-label">Projects</h2>
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
                  icon="folder"
                  label={p.name}
                  count={p.count}
                  active={filters.project === p.id && !filters.folder}
                  onClick={() => go({ project: p.id })}
                  menu={[
                    { label: 'New folder', run: () => setEditing(`new-folder:${p.id}`) },
                    { label: 'Rename', run: () => setEditing(p.id) },
                    ...(canShare ? [{ label: 'Share with a guest…', run: () => setSharing(p) }] : []),
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
                                const ok = await confirmDialog({ title: `Delete the folder “${f.name}”?`, body: `Its papers stay in ${p.name}.`, confirmLabel: 'Delete folder', danger: true });
                                if (!ok) return;
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
          <ViewLink icon="list" label="Unsorted" count={groups.counts.unsorted} active={filters.project === 'unsorted'} onClick={() => go({ project: 'unsorted' })} />
        </ul>
      </div>

      <div className="sh-side-sec">
        <div className="sh-side-h">
          <h2 className="sh-side-label">Tags</h2>
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
          {groups.tags.map((t, i) => (
            <li key={t.id}>
              {editing === t.id ? (
                <InlineName initial={t.name} placeholder="Tag name" label="Rename tag" onCancel={() => setEditing(null)} onSave={async (n) => (await groups.updateTag(t.id, { name: n })) && setEditing(null)} />
              ) : (
                <ViewRow
                  dot={tagColor(t, i)}
                  label={t.name}
                  count={t.count}
                  active={filters.tag === t.id}
                  onClick={() => go({ tag: t.id })}
                  menu={[
                    { label: 'Rename', run: () => setEditing(t.id) },
                    {
                      label: 'Delete',
                      danger: true,
                      run: async () => {
                        const ok = await confirmDialog({ title: `Delete the tag “${t.name}”?`, body: 'It’s removed from every paper. The papers stay on your shelf.', confirmLabel: 'Delete tag', danger: true });
                        if (!ok) return;
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
    </nav>
  );
}

function ViewLink({ icon, label, count, active, onClick, warn = false }: { icon: 'list' | 'alert' | 'swap'; label: string; count: number; active: boolean; onClick: () => void; warn?: boolean }) {
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
function ViewRow({ icon, dot, label, count, active, onClick, menu }: { icon?: 'folder'; dot?: string; label: string; count: number; active: boolean; onClick: () => void; menu: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  return (
    <div className="sh-row" ref={box}>
      <button type="button" className={`sh-view${!icon && !dot ? ' is-sub' : ''}`} aria-current={active ? 'true' : undefined} onClick={onClick} title={label}>
        {icon ? <Icon name={icon} /> : dot ? <span className="sh-dot" style={{ background: dot }} /> : null}
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

/* A tag's dot: its own colour, else one of a few calm ones in turn. */
const DOTS = ['#e2a01b', '#2e7d5b', '#4b7bb5', '#b4472f', '#7a5cb8', '#2b8a9a'];
const tagColor = (t: { color: string | null }, i: number) => t.color || DOTS[i % DOTS.length];
