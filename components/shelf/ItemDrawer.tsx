'use client';

import { useEffect, useRef, useState } from 'react';
import type { BulkBody } from '@/lib/shelf/api/bodies';
import { READING_STATUSES, type ReadingStatus, type ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort, citationLabel, doiHref, languageName, openalexHref, typeLabel } from '../papers/format';
import { toast } from '../toast';
import { emptyDraft, ManualForm } from './add/ManualForm';
import { PdfSection } from './pdf/PdfSection';
import { ShelfApiError, shelfFetch } from './api';
import type { DistributiveOmit } from './BulkBar';
import { runBulk } from './bulk';
import { STATUS_LABELS } from './shelf-state';
import type { GroupsApi } from './useShelfGroups';

/* One saved paper in the side drawer: its details, and everything the user
   keeps with it (reading status, projects and folders, tags, note). */
export function ItemDrawer({
  item,
  groups,
  onChange,
  onRemove,
  onClose,
  children,
}: {
  item: ShelfItem;
  groups: GroupsApi;
  onChange: (item: ShelfItem) => void;
  onRemove: (item: ShelfItem) => void;
  onClose: () => void;
  /* sections added by later features (the PDF) */
  children?: React.ReactNode;
}) {
  const p = item.paper;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (action: DistributiveOmit<BulkBody, 'ids'>) => {
    setBusy(true);
    try {
      const r = await runBulk({ ...action, ids: [item.id] } as BulkBody);
      if (r.items[0]) onChange(r.items[0]);
      void groups.reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const meta = [p.year, p.source, typeLabel(p.type), languageName(p.language)].filter(Boolean);
  const unusedTags = groups.tags.filter((t) => !item.tagIds.includes(t.id));

  return (
    <div className="drawer-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer fp-drawer sh-drawer" role="dialog" aria-modal="true" aria-labelledby="sh-item-title">
        <div className="fp-drawer-head">
          <span className="fp-drawer-kicker">On your shelf</span>
          <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="fp-drawer-body">
          <article className="fp-detail">
            {p.isRetracted && (
              <p className="fp-retracted" role="alert">
                <Icon name="alert" />
                <span>
                  <b>This paper has been retracted.</b> Its findings should not be relied on or cited as valid.
                </span>
              </p>
            )}
            <h2 className="fp-detail-title" id="sh-item-title">
              {p.title}
            </h2>
            <p className="fp-detail-authors">{p.authors.length ? p.authors.map((a) => a.name).join(', ') : authorsShort([])}</p>
            {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
            <div className="fp-detail-facts">
              {p.origin === 'openalex' && <span className="tag">{citationLabel(p.citedByCount)}</span>}
              {p.origin === 'manual' && <span className="tag">Added manually</span>}
              {p.origin === 'import' && <span className="tag">Imported</span>}
              {p.isOpenAccess && <span className="tag oa">Open access</span>}
            </div>
            <div className="fp-detail-links">
              {p.pdfUrl && (
                <a className="btn btn-thread btn-sm" href={p.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="pdf" /> Free PDF
                </a>
              )}
              {!p.pdfUrl && p.landingUrl && (
                <a className="btn btn-ghost btn-sm" href={p.landingUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" /> Publisher page
                </a>
              )}
              <span className="fp-links">
                {p.doi && (
                  <a href={doiHref(p.doi)} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" /> DOI {p.doi}
                  </a>
                )}
                {p.openalexId && (
                  <a href={openalexHref(p.openalexId)} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" /> OpenAlex
                  </a>
                )}
              </span>
            </div>

            {p.origin !== 'openalex' && (
              <section className="fp-detail-sec" aria-labelledby="sh-details-h">
                <h3 id="sh-details-h">Details</h3>
                {editing ? (
                  <ManualForm
                    initial={emptyDraft({
                      title: p.title,
                      authors: p.authors.map((a) => a.name).join('\n'),
                      year: p.year ? String(p.year) : '',
                      source: p.source ?? '',
                      url: p.landingUrl ?? '',
                      doi: p.doi ?? '',
                    })}
                    submitLabel="Save details"
                    onCancel={() => setEditing(false)}
                    onSubmit={async (details) => {
                      try {
                        onChange(await shelfFetch<ShelfItem>(`/api/shelf/papers/${item.id}`, { method: 'PATCH', body: { details: { ...details, abstract: p.abstract, type: p.type } } }));
                        setEditing(false);
                        return null;
                      } catch (e) {
                        return (e as ShelfApiError).code === 'duplicate' ? 'Another paper on your shelf already has this DOI.' : (e as Error).message;
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm sh-edit-btn" onClick={() => setEditing(true)}>
                    <Icon name="wand" /> Edit details
                  </button>
                )}
              </section>
            )}

            <section className="fp-detail-sec" aria-labelledby="sh-status-h">
              <h3 id="sh-status-h">Reading status</h3>
              <div className="seg sh-seg" role="group" aria-labelledby="sh-status-h">
                {READING_STATUSES.map((s) => (
                  <button key={s} type="button" aria-pressed={item.readingStatus === s} disabled={busy} onClick={() => item.readingStatus !== s && act({ action: 'status', status: s as ReadingStatus })}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </section>

            <section className="fp-detail-sec" aria-labelledby="sh-proj-h">
              <h3 id="sh-proj-h">Projects and folders</h3>
              {groups.projects.length ? (
                <ul className="sh-checks">
                  {groups.projects.map((pr) => {
                    const inProject = item.projectIds.includes(pr.id);
                    return (
                      <li key={pr.id}>
                        <label className="check">
                          <input type="checkbox" checked={inProject} disabled={busy} onChange={() => act(inProject ? { action: 'remove_project', projectId: pr.id } : { action: 'add_project', projectId: pr.id })} />
                          {pr.name}
                        </label>
                        {groups.folders.some((f) => f.projectId === pr.id) && (
                          <ul className="sh-checks sh-checks-in">
                            {groups.folders
                              .filter((f) => f.projectId === pr.id)
                              .map((f) => {
                                const inFolder = item.folderIds.includes(f.id);
                                return (
                                  <li key={f.id}>
                                    <label className="check">
                                      <input type="checkbox" checked={inFolder} disabled={busy} onChange={() => act(inFolder ? { action: 'remove_folder', folderId: f.id } : { action: 'add_folder', folderId: f.id })} />
                                      {f.name}
                                    </label>
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="sh-hint">No projects yet. Create one in the list on the left. Papers in no project are under Unsorted.</p>
              )}
            </section>

            <section className="fp-detail-sec" aria-labelledby="sh-tags-h">
              <h3 id="sh-tags-h">Tags</h3>
              <div className="sh-chips">
                {item.tagIds.map((id) => {
                  const t = groups.tags.find((x) => x.id === id);
                  return t ? (
                    <span key={id} className="tag sh-chip">
                      #{t.name}
                      <button type="button" onClick={() => act({ action: 'untag', tagIds: [id] })} disabled={busy} aria-label={`Remove the tag ${t.name}`}>
                        <Icon name="x" />
                      </button>
                    </span>
                  ) : null;
                })}
                <TagAdder disabled={busy} options={unusedTags} onAdd={(tag) => act(tag.id ? { action: 'tag', tagIds: [tag.id], tagNames: [] } : { action: 'tag', tagIds: [], tagNames: [tag.name] })} />
              </div>
            </section>

            <NoteEditor key={item.id} item={item} onSaved={onChange} />

            <PdfSection item={item} onChange={onChange} />

            {children}

            {p.abstract && (
              <section className="fp-detail-sec" aria-labelledby="sh-abs-h">
                <h3 id="sh-abs-h">Abstract</h3>
                <p className="fp-detail-abstract">{p.abstract}</p>
              </section>
            )}

            <section className="fp-detail-sec">
              <button type="button" className="btn btn-ghost btn-sm sh-bulk-del" onClick={() => onRemove(item)}>
                <Icon name="trash" /> Remove from shelf
              </button>
            </section>
          </article>
        </div>
      </aside>
    </div>
  );
}

/* Pick an existing tag or type a new one. */
function TagAdder({ options, disabled, onAdd }: { options: { id: string; name: string }[]; disabled: boolean; onAdd: (t: { id?: string; name: string }) => void }) {
  const [value, setValue] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim().replace(/^#/, '');
    if (!name) return;
    const known = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    onAdd(known ?? { name: name.slice(0, 80) });
    setValue('');
  };
  return (
    <form className="sh-tag-add" onSubmit={submit}>
      <input className="input" list="sh-tag-options" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a tag" aria-label="Add a tag" maxLength={80} disabled={disabled} />
      <datalist id="sh-tag-options">
        {options.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
    </form>
  );
}

/* The personal note: saved with the button, or when the field loses focus. */
function NoteEditor({ item, onSaved }: { item: ShelfItem; onSaved: (item: ShelfItem) => void }) {
  const [note, setNote] = useState(item.note ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = note !== (item.note ?? '');

  const save = async () => {
    if (!dirty) return;
    setState('saving');
    try {
      onSaved(await shelfFetch<ShelfItem>(`/api/shelf/papers/${item.id}`, { method: 'PATCH', body: { note } }));
      setState('saved');
    } catch (e) {
      toast((e as Error).message, true);
      setState('idle');
    }
  };

  return (
    <section className="fp-detail-sec" aria-labelledby="sh-note-h">
      <h3 id="sh-note-h">Your note</h3>
      <textarea
        className="input sh-note-input"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setState('idle');
        }}
        onBlur={save}
        maxLength={20_000}
        rows={5}
        placeholder="What matters in this paper, where you might cite it…"
      />
      <div className="sh-note-foot">
        <span className="small">{state === 'saving' ? 'Saving…' : state === 'saved' && !dirty ? 'Saved' : 'Only you can see your notes.'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={!dirty || state === 'saving'}>
          Save note
        </button>
      </div>
    </section>
  );
}
