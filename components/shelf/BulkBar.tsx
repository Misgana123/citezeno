'use client';

import type { BulkBody } from '@/lib/shelf/api/bodies';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { Select, type SelectGroup } from '../Select';
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

      <Select
        className="select sh-bulk-sel"
        value=""
        placeholder="Status…"
        disabled={busy}
        aria-label="Set reading status"
        options={READING_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        onChange={(v) => onRun({ action: 'status', status: v as ReadingStatus }, `Marked ${STATUS_LABELS[v as ReadingStatus].toLowerCase()}`)}
      />

      <Select
        className="select sh-bulk-sel"
        value=""
        placeholder="Move to…"
        disabled={busy}
        aria-label="Move to"
        options={[{ value: 'unsorted', label: 'Unsorted' }, ...groupOptions(groups, folderLabel)]}
        onChange={(v) => {
          if (v === 'unsorted') onRun({ action: 'move', projectId: null, folderId: null }, 'Moved to Unsorted');
          else if (v.startsWith('p:')) onRun({ action: 'move', projectId: v.slice(2) }, 'Moved');
          else onRun({ action: 'move', folderId: v.slice(2) }, 'Moved');
        }}
      />

      <Select
        className="select sh-bulk-sel"
        value=""
        placeholder="Add to…"
        disabled={busy || !groups.projects.length}
        aria-label="Add to a project or folder"
        options={groupOptions(groups, folderLabel)}
        onChange={(v) => onRun(v.startsWith('p:') ? { action: 'add_project', projectId: v.slice(2) } : { action: 'add_folder', folderId: v.slice(2) }, 'Added')}
      />

      <Select
        className="select sh-bulk-sel"
        value=""
        placeholder="Tag…"
        disabled={busy}
        aria-label="Add a tag"
        options={[...groups.tags.map((t) => ({ value: t.id, label: `#${t.name}` })), { value: 'new', label: 'New tag…' }]}
        onChange={(v) => {
          if (v !== 'new') return onRun({ action: 'tag', tagIds: [v], tagNames: [] }, 'Tagged');
          const name = window.prompt('New tag name')?.trim();
          if (name) onRun({ action: 'tag', tagIds: [], tagNames: [name.slice(0, 80)] }, `Tagged #${name}`);
        }}
      />

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

function groupOptions(groups: GroupsApi, folderLabel: (projectId: string, name: string) => string): SelectGroup[] {
  return [
    { label: 'Projects', options: groups.projects.map((p) => ({ value: `p:${p.id}`, label: p.name })) },
    { label: 'Folders', options: groups.folders.map((f) => ({ value: `f:${f.id}`, label: folderLabel(f.projectId, f.name) })) },
  ];
}

/* Omit for each member of a union (BulkBody without `ids`). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
