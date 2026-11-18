'use client';

import type { BulkBody } from '@/lib/shelf/api/bodies';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { STATUS_LABELS } from './shelf-state';
import type { GroupsApi } from './useShelfGroups';

/* Shown while papers are selected: set status, move, add to a project or
   folder, tag, remove from the project being viewed, or delete them together.
   `extra` holds actions added by later features (export). */
export function BulkBar({
  count,
  groups,
  viewProjectId,
  busy,
  onRun,
  onDelete,
  onClear,
  onSelectAll,
  extra,
}: {
  count: number;
  groups: GroupsApi;
  viewProjectId: string | null;
  busy: boolean;
  onRun: (action: DistributiveOmit<BulkBody, 'ids'>, done: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll?: () => void;
  extra?: React.ReactNode;
}) {
  const folderLabel = (projectId: string, name: string) => `${groups.projects.find((p) => p.id === projectId)?.name ?? ''} › ${name}`;
  const pick = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    e.target.value = '';
    if (v) fn(v);
  };
  const viewProject = viewProjectId ? groups.projects.find((p) => p.id === viewProjectId) : null;

  return (
    <div className="sh-bulk" role="toolbar" aria-label={`${count} selected`}>
      <span className="sh-bulk-n">
        <b>{count}</b> selected
      </span>
      {onSelectAll && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSelectAll} disabled={busy}>
          Select all
        </button>
      )}

      <select className="select sh-bulk-sel" defaultValue="" disabled={busy} aria-label="Set reading status" onChange={pick((v) => onRun({ action: 'status', status: v as ReadingStatus }, `Marked ${STATUS_LABELS[v as ReadingStatus].toLowerCase()}`))}>
        <option value="">Status…</option>
        {READING_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        className="select sh-bulk-sel"
        defaultValue=""
        disabled={busy}
        aria-label="Move to"
        onChange={pick((v) => {
          if (v === 'unsorted') onRun({ action: 'move', projectId: null, folderId: null }, 'Moved to Unsorted');
          else if (v.startsWith('p:')) onRun({ action: 'move', projectId: v.slice(2) }, 'Moved');
          else onRun({ action: 'move', folderId: v.slice(2) }, 'Moved');
        })}
      >
        <option value="">Move to…</option>
        <option value="unsorted">Unsorted</option>
        <GroupOptions groups={groups} folderLabel={folderLabel} />
      </select>

      <select
        className="select sh-bulk-sel"
        defaultValue=""
        disabled={busy || !groups.projects.length}
        aria-label="Add to a project or folder"
        onChange={pick((v) => onRun(v.startsWith('p:') ? { action: 'add_project', projectId: v.slice(2) } : { action: 'add_folder', folderId: v.slice(2) }, 'Added'))}
      >
        <option value="">Add to…</option>
        <GroupOptions groups={groups} folderLabel={folderLabel} />
      </select>

      <select
        className="select sh-bulk-sel"
        defaultValue=""
        disabled={busy}
        aria-label="Add a tag"
        onChange={pick((v) => {
          if (v !== 'new') return onRun({ action: 'tag', tagIds: [v], tagNames: [] }, 'Tagged');
          const name = window.prompt('New tag name')?.trim();
          if (name) onRun({ action: 'tag', tagIds: [], tagNames: [name.slice(0, 80)] }, `Tagged #${name}`);
        })}
      >
        <option value="">Tag…</option>
        {groups.tags.map((t) => (
          <option key={t.id} value={t.id}>
            #{t.name}
          </option>
        ))}
        <option value="new">New tag…</option>
      </select>

      {viewProject && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onRun({ action: 'remove_project', projectId: viewProject.id }, `Removed from ${viewProject.name}`)}>
          Remove from project
        </button>
      )}
      {extra}
      <button type="button" className="btn btn-ghost btn-sm sh-bulk-del" disabled={busy} onClick={onDelete}>
        <Icon name="trash" /> Delete
      </button>
      <button type="button" className="icon-btn sh-bulk-x" onClick={onClear} aria-label="Clear the selection">
        <Icon name="x" />
      </button>
    </div>
  );
}

function GroupOptions({ groups, folderLabel }: { groups: GroupsApi; folderLabel: (projectId: string, name: string) => string }) {
  return (
    <>
      {groups.projects.length > 0 && (
        <optgroup label="Projects">
          {groups.projects.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {groups.folders.length > 0 && (
        <optgroup label="Folders">
          {groups.folders.map((f) => (
            <option key={f.id} value={`f:${f.id}`}>
              {folderLabel(f.projectId, f.name)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

/* Omit for each member of a union (BulkBody without `ids`). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
