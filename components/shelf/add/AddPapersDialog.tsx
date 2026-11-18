'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { ShelfApiError, shelfFetch } from '../api';
import type { GroupsApi } from '../useShelfGroups';
import { LookupTab } from './LookupTab';
import { emptyDraft, ManualForm, type ManualDraft } from './ManualForm';

/* "Add papers": find one by DOI, link or title, or type it in by hand. Later
   features add more ways in through `extraTabs` (PDF upload, file import). */

export type AddTab = { key: string; label: string; icon: 'search' | 'doc' | 'upload' | 'download'; render: (ctx: AddContext) => ReactNode };
export type AddContext = { projectId: string | null; onAdded: (item: ShelfItem) => void; onManual: (draft: Partial<ManualDraft>) => void; close: () => void };

export function AddPapersDialog({
  groups,
  defaultProjectId,
  onAdded,
  onClose,
  extraTabs = [],
}: {
  groups: GroupsApi;
  defaultProjectId: string | null;
  onAdded: (item: ShelfItem) => void;
  onClose: () => void;
  extraTabs?: AddTab[];
}) {
  const [tab, setTab] = useState('find');
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [draft, setDraft] = useState<ManualDraft>(emptyDraft());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ctx: AddContext = {
    projectId,
    onAdded,
    onManual: (d) => {
      setDraft(emptyDraft(d));
      setTab('manual');
    },
    close: onClose,
  };

  const tabs: AddTab[] = [
    { key: 'find', label: 'DOI, link or title', icon: 'search', render: (c) => <LookupTab projectId={c.projectId} onAdded={c.onAdded} onManual={c.onManual} /> },
    ...extraTabs,
    {
      key: 'manual',
      label: 'By hand',
      icon: 'doc',
      render: (c) => (
        <ManualForm
          key={JSON.stringify(draft)}
          initial={draft}
          submitLabel="Add paper"
          onSubmit={async (details) => {
            try {
              const r = await shelfFetch<{ item: ShelfItem }>('/api/shelf/papers', { method: 'POST', body: { via: 'manual', details, projectId: c.projectId } });
              c.onAdded(r.item);
              toast('Added to your shelf');
              setDraft(emptyDraft());
              return null;
            } catch (e) {
              return (e as ShelfApiError).code === 'duplicate' ? 'A paper with this DOI is already on your shelf.' : (e as Error).message;
            }
          }}
        />
      ),
    },
  ];
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog sh-add-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-add-h" ref={box}>
        <div className="sh-add-head">
          <h2 id="sh-add-h">Add papers</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="seg sh-add-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === current.key} aria-pressed={t.key === current.key} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        <label className="sh-add-into">
          Add to
          <select className="select" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}>
            <option value="">Unsorted</option>
            {groups.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sh-add-body" role="tabpanel">
          {current.render(ctx)}
        </div>
      </div>
    </div>
  );
}
