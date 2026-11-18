'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BulkBody } from '@/lib/shelf/api/bodies';
import type { ListSort } from '@/lib/shelf/store/list-query';
import { READING_STATUSES, type ReadingStatus, type ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { toast } from '../toast';
import { AddPapersDialog } from './add/AddPapersDialog';
import { FilesDialog } from './pdf/FilesDialog';
import { PdfUploadTab } from './pdf/PdfUploadTab';
import { ImportTab } from './add/ImportTab';
import { shelfFetch } from './api';
import { BulkBar, type DistributiveOmit } from './BulkBar';
import { DuplicatesView } from './DuplicatesView';
import { runBulk } from './bulk';
import { ItemDrawer } from './ItemDrawer';
import { markSaved } from './saved-store';
import { ShelfCard } from './ShelfCard';
import { ExportMenu } from './export/ExportMenu';
import { ShelfSearch } from './ShelfSearch';
import { ShelfSidebar, type ViewPick } from './ShelfSidebar';
import { filtersFromParams, filtersToParams, SORT_LABELS, STATUS_LABELS, type ShelfFilters } from './shelf-state';
import { useShelfGroups } from './useShelfGroups';
import { useShelfList } from './useShelfList';

/* The shelf page: views on the left (all, Unsorted, projects, folders, tags),
   the papers on the right, a selection bar for bulk actions, and a drawer
   for one paper. The current view and filters live in the address bar. */
export function Shelf({ initialQuery, focusItem }: { initialQuery: string; focusItem: string | null }) {
  const [filters, setFilters] = useState<ShelfFilters>(() => filtersFromParams(new URLSearchParams(initialQuery)));
  const query = useMemo(() => filtersToParams(filters).toString(), [filters]);
  const list = useShelfList(query);
  const groups = useShelfGroups();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastPicked = useRef<string | null>(null);
  const [open, setOpen] = useState<ShelfItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sideOpen, setSideOpen] = useState(false); // phones: the views list is folded away
  const [adding, setAdding] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const closeFiles = useCallback(() => setFilesOpen(false), []);
  const closeAdd = useCallback(() => {
    setAdding(false);
    list.reload();
    void groups.reload();
  }, [list.reload, groups.reload]);
  /* during an import, refresh the counts now and then */
  const lastRefresh = useRef(0);
  const importProgress = useCallback(() => {
    if (Date.now() - lastRefresh.current < 5000) return;
    lastRefresh.current = Date.now();
    void groups.reload();
  }, [groups.reload]);
  const tagMap = useMemo(() => new Map(groups.tags.map((t) => [t.id, t])), [groups.tags]);

  // keep the address bar in step (back, reload, share); the open paper is in it too
  useEffect(() => {
    const qs = new URLSearchParams(query);
    if (open) qs.set('item', open.id);
    const s = qs.toString();
    const url = s ? `/shelf?${s}` : '/shelf';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [query, open]);

  // a new view starts with nothing selected
  useEffect(() => setSelected(new Set()), [query]);

  // arriving from a "Saved" link: open that paper
  useEffect(() => {
    if (!focusItem) return;
    shelfFetch<ShelfItem>(`/api/shelf/papers/${encodeURIComponent(focusItem)}`)
      .then(setOpen)
      .catch((e) => toast((e as Error).message, true));
  }, [focusItem]);

  const patchFilters = (p: Partial<ShelfFilters>) => setFilters((f) => ({ ...f, ...p }));
  const closeDrawer = useCallback(() => setOpen(null), []);

  const changed = (item: ShelfItem) => {
    list.replace(item);
    setOpen((o) => (o?.id === item.id ? item : o));
  };

  const setStatus = async (item: ShelfItem, readingStatus: ReadingStatus) => {
    changed({ ...item, readingStatus });
    try {
      changed(await shelfFetch<ShelfItem>(`/api/shelf/papers/${item.id}`, { method: 'PATCH', body: { readingStatus } }));
      if (filters.status) list.reload();
    } catch (e) {
      changed(item);
      toast((e as Error).message, true);
    }
  };

  const forget = (items: ShelfItem[]) => {
    list.drop(items.map((i) => i.id));
    for (const i of items) if (i.paper.openalexId) markSaved(i.paper.openalexId, null);
    setSelected((s) => new Set([...s].filter((id) => !items.some((i) => i.id === id))));
    setOpen((o) => (o && items.some((i) => i.id === o.id) ? null : o));
    void groups.reload();
  };

  const remove = async (item: ShelfItem) => {
    if (!window.confirm(`Remove “${item.paper.title}” from your shelf?`)) return;
    try {
      await shelfFetch(`/api/shelf/papers/${item.id}`, { method: 'DELETE' });
      forget([item]);
      toast('Removed from your shelf');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const select = (item: ShelfItem, on: boolean, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = list.items.map((i) => i.id);
      const from = lastPicked.current ? ids.indexOf(lastPicked.current) : -1;
      const to = ids.indexOf(item.id);
      const range = shift && from >= 0 && to >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [item.id];
      for (const id of range) on ? next.add(id) : next.delete(id);
      return next;
    });
    lastPicked.current = item.id;
  };

  /* Bulk actions. Views filtered by project, folder, tag or status reload,
     since the changed papers may no longer belong in them. */
  const bulk = async (action: DistributiveOmit<BulkBody, 'ids'>, done: string) => {
    const ids = [...selected];
    setBusy(true);
    try {
      const r = await runBulk({ ...action, ids } as BulkBody);
      r.items.forEach(changed);
      if (filters.project || filters.folder || filters.tag || filters.status) list.reload();
      void groups.reload();
      toast(`${done}: ${r.items.length} paper${r.items.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    const items = list.items.filter((i) => selected.has(i.id));
    if (!window.confirm(`Remove ${items.length} paper${items.length === 1 ? '' : 's'} from your shelf? Notes and tags on them are removed too.`)) return;
    setBusy(true);
    try {
      const r = await runBulk({ action: 'delete', ids: items.map((i) => i.id) });
      forget(items.filter((i) => r.deleted.includes(i.id)));
      toast(`Removed ${r.deleted.length} paper${r.deleted.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const title = viewTitle(filters, groups);

  return (
    <div className="sh">
      <button type="button" className="btn btn-ghost btn-sm sh-side-toggle" aria-expanded={sideOpen} aria-controls="sh-side" onClick={() => setSideOpen((o) => !o)}>
        <Icon name="layers" /> Projects and tags
        <Icon name="chevron" className="sh-side-chev" />
      </button>
      <ShelfSidebar
        onFiles={() => setFilesOpen(true)}
        open={sideOpen}
        groups={groups}
        filters={filters}
        onPick={(p: ViewPick) => {
          patchFilters(p);
          setSideOpen(false);
        }}
      />

      <section className="sh-main" aria-label={title}>
        <div className="sh-head">
          <h2 className="h3">{title}</h2>
          <button type="button" className="btn btn-thread btn-sm sh-add-btn" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add papers
          </button>
        </div>

        {filters.dups ? (
          <DuplicatesView
            onChanged={(removedId) => {
              list.reload();
              void groups.reload();
              if (removedId) setOpen((o) => (o?.id === removedId ? null : o));
            }}
          />
        ) : (
          <>
            <ShelfSearch filters={filters} onChange={patchFilters} />

            <div className="sh-tools">
              <div className="seg sh-seg" role="group" aria-label="Reading status">
                <button type="button" aria-pressed={!filters.status} onClick={() => patchFilters({ status: '' })}>
                  All
                </button>
                {READING_STATUSES.map((s) => (
                  <button key={s} type="button" aria-pressed={filters.status === s} onClick={() => patchFilters({ status: s })}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="fp-results-head">
              <p className="fp-count" role="status">
                {list.status === 'loading' ? 'Loading…' : `${formatCount(list.total)} paper${list.total === 1 ? '' : 's'}`}
              </p>
              <span className="sh-results-tools">
                <ExportMenu groups={groups} query={new URLSearchParams(query)} baseName={exportName(title)} />
                <label className="fp-sort">
                  Sort
                  <select className="select" value={filters.sort} onChange={(e) => patchFilters({ sort: e.target.value as ListSort })}>
                    {Object.entries(SORT_LABELS)
                      .filter(([k]) => k !== 'relevance' || filters.q.trim())
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                </label>
              </span>
            </div>

            {selected.size > 0 && (
              <BulkBar
                count={selected.size}
                groups={groups}
                viewProjectId={filters.project && filters.project !== 'unsorted' ? filters.project : null}
                busy={busy}
                onRun={bulk}
                onDelete={bulkDelete}
                onClear={() => setSelected(new Set())}
                onSelectAll={selected.size < list.items.length ? () => setSelected(new Set(list.items.map((i) => i.id))) : undefined}
                extra={<ExportMenu groups={groups} query={new URLSearchParams({ ids: [...selected].join(',') })} baseName="citezeno-selected" label="Export" everything={false} />}
              />
            )}

            {list.status === 'loading' ? (
              <div className="fp-loading" role="status" aria-label="Loading your shelf">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="hist-loading fp-skel" />
                ))}
              </div>
            ) : list.status === 'error' && !list.items.length ? (
              <div className="fp-error" role="alert">
                <Icon name="alert" />
                <p>{list.error?.message}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={list.reload}>
                  Try again
                </button>
              </div>
            ) : !list.items.length ? (
              <EmptyView everything={!query || query === `sort=${filters.sort}`} onShowAll={() => setFilters(filtersFromParams(new URLSearchParams()))} />
            ) : (
              <>
                <ol className="fp-list">
                  {list.items.map((item) => (
                    <ShelfCard
                      key={item.id}
                      item={item}
                      tags={tagMap}
                      active={open?.id === item.id}
                      selected={selected.has(item.id)}
                      onSelect={select}
                      onOpen={setOpen}
                      onStatus={setStatus}
                      onRemove={remove}
                    />
                  ))}
                </ol>
                {list.hasMore && (
                  <div className="fp-more">
                    <button type="button" className="btn btn-ghost" onClick={list.loadMore} disabled={list.status === 'more'}>
                      {list.status === 'more' ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" />}
                      {list.status === 'more' ? 'Loading…' : 'Load more'}
                    </button>
                    <span className="small">
                      Showing {formatCount(list.items.length)} of {formatCount(list.total)}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {adding && (
        <AddPapersDialog
          groups={groups}
          defaultProjectId={filters.project && filters.project !== 'unsorted' ? filters.project : null}
          onClose={closeAdd}
          onAdded={() => {
            list.reload();
            void groups.reload();
          }}
          extraTabs={[
            {
              key: 'pdf',
              label: 'Upload PDFs',
              icon: 'upload',
              render: (c) => <PdfUploadTab projectId={c.projectId} onAdded={c.onAdded} onManageFiles={() => setFilesOpen(true)} />,
            },
            { key: 'import', label: 'Import file', icon: 'download', render: (c) => <ImportTab projectId={c.projectId} onProgress={importProgress} /> },
          ]}
        />
      )}

      {filesOpen && <FilesDialog onClose={closeFiles} onDeleted={list.reload} />}

      {open && <ItemDrawer item={open} groups={groups} onChange={changed} onRemove={remove} onClose={closeDrawer} />}
    </div>
  );
}

/* "citezeno-thesis" for a project called Thesis. */
const exportName = (title: string) => `citezeno-${title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shelf'}`;

function viewTitle(f: ShelfFilters, g: ReturnType<typeof useShelfGroups>): string {
  if (f.folder) return g.folders.find((x) => x.id === f.folder)?.name ?? 'Folder';
  if (f.project === 'unsorted') return 'Unsorted';
  if (f.project) return g.projects.find((x) => x.id === f.project)?.name ?? 'Project';
  if (f.tag) return `#${g.tags.find((x) => x.id === f.tag)?.name ?? 'tag'}`;
  if (f.retracted) return 'Retracted papers';
  if (f.dups) return 'Possible duplicates';
  return 'All papers';
}

function EmptyView({ everything, onShowAll }: { everything: boolean; onShowAll: () => void }) {
  return everything ? (
    <div className="lib-empty fp-empty">
      <Icon name="layers" />
      <h2 className="h3">Your shelf is empty</h2>
      <p>Save papers from Find Papers and they stay here until you remove them.</p>
      <a className="btn btn-thread btn-sm" href="/papers">
        <Icon name="search" /> Find papers
      </a>
    </div>
  ) : (
    <div className="lib-empty fp-empty">
      <Icon name="filter" />
      <h2 className="h3">No papers here</h2>
      <p>Nothing on your shelf matches this view.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onShowAll}>
        Show all papers
      </button>
    </div>
  );
}
