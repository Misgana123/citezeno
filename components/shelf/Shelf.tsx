'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BulkBody } from '@/lib/shelf/api/bodies';
import { collectionOf, type ReadingStatus, type ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { confirmDialog } from '../confirm';
import { toast } from '../toast';
import { AddPapersDialog } from './add/AddPapersDialog';
import { FilesDialog } from './pdf/FilesDialog';
import { PdfUploadTab } from './pdf/PdfUploadTab';
import { ImportTab } from './add/ImportTab';
import { shelfFetch, shelfSpace } from './api';
import { BulkBar, type DistributiveOmit } from './BulkBar';
import { DuplicatesView } from './DuplicatesView';
import { runBulk } from './bulk';
import { ItemDrawer } from './ItemDrawer';
import { markSaved } from './saved-store';
import { ChipBar } from './ChipBar';
import { FilterMenu } from './FilterMenu';
import { FoundTable } from './found/FoundTable';
import { SortPill } from './SortPill';
import { ExportMenu } from './export/ExportMenu';
import { RetractionNotices } from './RetractionNotices';
import { ShelfSidebar, type ViewPick } from './ShelfSidebar';
import { CopyToLab } from '../labs/CopyToLab';
import { activeFilterCount, COLLECTION_LABELS, filtersFromParams, filtersToParams, listParams, type ShelfFilters } from './shelf-state';
import { CollectionNav } from './CollectionNav';
import { ShelfHead } from './ShelfHead';
import { StorageMeter } from './uploads/StorageMeter';
import { UploadsGallery } from './uploads/UploadsGallery';
import { useFileDrop } from './uploads/useFileDrop';
import { useShelfGroups } from './useShelfGroups';
import { useShelfList } from './useShelfList';
import { ContinueReading } from '../reader/ContinueReading';

/* The shelf page: views on the left (all, Unsorted, projects, folders, tags),
   the papers on the right, a selection bar for bulk actions, and a drawer
   for one paper. The current view and filters live in the address bar. */
export function Shelf({ initialQuery, focusItem, top }: { initialQuery: string; focusItem: string | null; /* the lab switch */ top?: React.ReactNode }) {
  const [filters, setFilters] = useState<ShelfFilters>(() => filtersFromParams(new URLSearchParams(initialQuery)));
  // the address bar leaves out defaults; listing requests always name the collection
  const query = useMemo(() => filtersToParams(filters).toString(), [filters]);
  const listQuery = useMemo(() => listParams(filters).toString(), [filters]);
  const list = useShelfList(listQuery);
  const groups = useShelfGroups();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastPicked = useRef<string | null>(null);
  const [open, setOpen] = useState<ShelfItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sideOpen, setSideOpen] = useState(false); // phones: the views list is folded away
  const [adding, setAdding] = useState(false);
  // Add papers opened by dropping PDFs on the page: on the upload tab, with those files
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  // the paper just added, highlighted once where it landed
  const [freshId, setFreshId] = useState<string | null>(null);
  // bumped when PDFs come or go, so the storage meter reloads
  const [storageV, setStorageV] = useState(0);
  const uploads = filters.collection === 'uploads' && !filters.dups;
  const closeFiles = useCallback(() => setFilesOpen(false), []);
  const closeAdd = useCallback(() => {
    setAdding(false);
    setDropped(null);
    setStorageV((v) => v + 1);
    list.reload();
    void groups.reload();
  }, [list.reload, groups.reload]);
  const openAdd = useCallback((files: File[] | null = null) => {
    setDropped(files);
    setAdding(true);
  }, []);
  const dragging = useFileDrop(openAdd, !adding);

  /* After adding: show the collection it went to (inside the same project or
     folder) and highlight it there, so it never seems to vanish. */
  const added = useCallback(
    (item: ShelfItem) => {
      const to = collectionOf(item.addedVia);
      setFilters((f) => (f.dups ? { ...f, dups: false, collection: to } : f.collection === to ? f : { ...f, collection: to }));
      setFreshId(item.id);
      list.reload();
      void groups.reload();
    },
    [list.reload, groups.reload],
  );
  useEffect(() => {
    if (!freshId || !list.items.some((i) => i.id === freshId)) return;
    document.getElementById(`item-${freshId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setFreshId(null), 3000);
    return () => clearTimeout(t);
  }, [freshId, list.items]);
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
    const url = s ? `/app/shelf?${s}` : '/app/shelf';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [query, open]);

  // a new view starts with nothing selected
  useEffect(() => setSelected(new Set()), [query]);

  const openItem = useCallback((id: string) => {
    shelfFetch<ShelfItem>(`/api/shelf/papers/${encodeURIComponent(id)}`)
      .then(setOpen)
      .catch((e) => toast((e as Error).message, true));
  }, []);

  // arriving from a "Saved" link: open that paper
  useEffect(() => {
    if (focusItem) openItem(focusItem);
  }, [focusItem, openItem]);

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
    for (const i of items) if (i.paper.provider) markSaved(i.paper.id, null);
    setSelected((s) => new Set([...s].filter((id) => !items.some((i) => i.id === id))));
    setOpen((o) => (o && items.some((i) => i.id === o.id) ? null : o));
    void groups.reload();
  };

  const remove = async (item: ShelfItem) => {
    const ok = await confirmDialog({
      title: `Remove “${item.paper.title}” from your shelf?`,
      body: 'Its notes, tags and PDFs on the shelf are removed too.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await shelfFetch(`/api/shelf/papers/${item.id}`, { method: 'DELETE' });
      forget([item]);
      if (item.pdfs.length) setStorageV((v) => v + 1);
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
    const ok = await confirmDialog({
      title: `Remove ${items.length} paper${items.length === 1 ? '' : 's'} from your shelf?`,
      body: 'Notes and tags on them are removed too.',
      confirmLabel: `Remove ${items.length === 1 ? 'paper' : 'papers'}`,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await runBulk({ action: 'delete', ids: items.map((i) => i.id) });
      forget(items.filter((i) => r.deleted.includes(i.id)));
      setStorageV((v) => v + 1);
      toast(`Removed ${r.deleted.length} paper${r.deleted.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const view = viewTitle(filters, groups);
  const title = view ?? COLLECTION_LABELS[filters.collection].name;

  return (
    <div className="sh">
      {dragging && (
        <div className="sh-drop" aria-hidden="true">
          <div className="sh-drop-card">
            <Icon name="upload" />
            <b>Drop to upload to My uploads</b>
            <span>PDFs only. We’ll suggest the paper, or keep it as your own document.</span>
          </div>
        </div>
      )}
      <ShelfSidebar
        top={top}
        open={sideOpen}
        groups={groups}
        filters={filters}
        onPick={(p: ViewPick) => {
          patchFilters(p);
          setSideOpen(false);
        }}
      />

      <section className="sh-main" aria-label={title}>
        <div className="sh-wrap">
          {/* phones: the sidebar folds away; the collections stay in reach */}
          <div className="sh-mobile">
            <CollectionNav current={filters.dups ? null : filters.collection} counts={groups.counts} onPick={(collection) => patchFilters({ collection, project: '', folder: '', tag: '', retracted: false, dups: false })} />
            <button type="button" className="btn btn-ghost btn-sm sh-side-toggle" aria-expanded={sideOpen} aria-controls="sh-side" onClick={() => setSideOpen((o) => !o)}>
              <Icon name="folder" /> Projects and tags
              <Icon name="chevron" className="sh-side-chev" />
            </button>
          </div>

          <ShelfHead collection={filters.dups ? null : filters.collection} view={view} filters={filters} onFilters={patchFilters} onAdd={() => openAdd()} />
          <RetractionNotices onOpen={openItem} onRead={() => window.dispatchEvent(new Event('citezeno:shelf-notices'))} />
          <ContinueReading />

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
              <ChipBar filters={filters} onChange={patchFilters}>
                {uploads && <StorageMeter version={storageV} onManage={() => setFilesOpen(true)} />}
                <FilterMenu filters={filters} onChange={patchFilters} />
                <ExportMenu groups={groups} query={new URLSearchParams(listQuery)} baseName={exportName(title)} compact />
                <SortPill value={filters.sort} searching={!!filters.q.trim()} onChange={(sort) => patchFilters({ sort })} />
              </ChipBar>

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
                  extra={
                    <>
                      <ExportMenu groups={groups} query={new URLSearchParams({ ids: [...selected].join(',') })} baseName="citezeno-selected" label="Export" everything={false} />
                      {!shelfSpace() && <CopyToLab itemIds={[...selected]} onDone={() => setSelected(new Set())} />}
                    </>
                  }
                />
              )}

              {list.status === 'loading' && uploads ? (
                <ol className="sh-gallery" role="status" aria-label="Loading your uploads">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="hist-loading sh-tile-skel" />
                  ))}
                </ol>
              ) : list.status === 'loading' ? (
                <div className="sh-table" role="status" aria-label="Loading your library">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="hist-loading sh-tr-skel" />
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
                <EmptyView
                  collection={filters.collection}
                  everything={!view && !filters.q.trim() && activeFilterCount(filters) === 0}
                  onShowAll={() => setFilters({ ...filtersFromParams(new URLSearchParams()), collection: filters.collection })}
                  onAdd={() => openAdd()}
                />
              ) : (
                <>
                  {uploads ? (
                    <UploadsGallery items={list.items} openId={open?.id ?? null} selected={selected} freshId={freshId} onSelect={select} onOpen={setOpen} onAdd={() => openAdd()} />
                  ) : (
                    <FoundTable items={list.items} tags={tagMap} openId={open?.id ?? null} selected={selected} freshId={freshId} onSelect={select} onOpen={setOpen} onStatus={setStatus} onRemove={remove} />
                  )}
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
        </div>
      </section>

      {adding && (
        <AddPapersDialog
          groups={groups}
          defaultProjectId={filters.project && filters.project !== 'unsorted' ? filters.project : null}
          initialTab={dropped || uploads ? 'pdf' : 'find'}
          onClose={closeAdd}
          onAdded={added}
          extraTabs={[
            {
              key: 'pdf',
              label: 'Upload PDFs',
              icon: 'upload',
              render: (c) => <PdfUploadTab projectId={c.projectId} onAdded={c.onAdded} onManageFiles={() => setFilesOpen(true)} initialFiles={dropped ?? undefined} />,
            },
            { key: 'import', label: 'Import file', icon: 'download', render: (c) => <ImportTab projectId={c.projectId} onProgress={importProgress} /> },
          ]}
        />
      )}

      {filesOpen && (
        <FilesDialog
          onClose={closeFiles}
          onDeleted={() => {
            list.reload();
            setStorageV((v) => v + 1);
          }}
        />
      )}

      {open && <ItemDrawer item={open} groups={groups} onChange={changed} onRemove={remove} onClose={closeDrawer} />}
    </div>
  );
}

/* "citezeno-thesis" for a project called Thesis. */
const exportName = (title: string) => `citezeno-${title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shelf'}`;

/* The view inside the collection, or null for the whole collection. */
function viewTitle(f: ShelfFilters, g: ReturnType<typeof useShelfGroups>): string | null {
  if (f.folder) return g.folders.find((x) => x.id === f.folder)?.name ?? 'Folder';
  if (f.project === 'unsorted') return 'Unsorted';
  if (f.project) return g.projects.find((x) => x.id === f.project)?.name ?? 'Project';
  if (f.tag) return `#${g.tags.find((x) => x.id === f.tag)?.name ?? 'tag'}`;
  if (f.retracted) return 'Retracted papers';
  if (f.dups) return 'Possible duplicates';
  return null;
}

function EmptyView({ collection, everything, onShowAll, onAdd }: { collection: ShelfFilters['collection']; everything: boolean; onShowAll: () => void; onAdd: () => void }) {
  if (everything && collection === 'uploads')
    return (
      <div className="lib-empty fp-empty">
        <Icon name="pdf" />
        <h2 className="h3">No uploads yet</h2>
        <p>Upload a PDF (course notes, a report, a paper) to read it, highlight it and ask about it. Drop files anywhere on this page.</p>
        <button type="button" className="btn btn-thread btn-sm" onClick={onAdd}>
          <Icon name="upload" /> Upload a PDF
        </button>
      </div>
    );
  return everything ? (
    <div className="lib-empty fp-empty">
      <Icon name="layers" />
      <h2 className="h3">Your library is empty</h2>
      <p>Save papers from Find Papers and they stay here until you remove them.</p>
      <a className="btn btn-thread btn-sm" href="/app/papers">
        <Icon name="compass" /> Explore papers
      </a>
    </div>
  ) : (
    <div className="lib-empty fp-empty">
      <Icon name="filter" />
      <h2 className="h3">No papers here</h2>
      <p>Nothing in {COLLECTION_LABELS[collection].name} matches this view.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onShowAll}>
        Show all of {COLLECTION_LABELS[collection].name}
      </button>
    </div>
  );
}
