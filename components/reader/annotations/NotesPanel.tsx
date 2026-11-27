'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../../Icon';
import { readerUrl } from '../api';
import { COLORS, type Annotations, type Highlight, type HighlightColor, type PageNote } from './useAnnotations';

/* The Notes tab: every highlight and note on the paper in page order. Click one
   to jump to it; filter by color; edit or delete; export with page numbers. */
export function NotesPanel({
  paperId,
  ann,
  missing,
  disabled,
  placing,
  onPlace,
  onJump,
}: {
  paperId: string;
  ann: Annotations;
  missing: Set<string>;
  /* no PDF, or no text layer: why highlights aren't available */
  disabled: string | null;
  placing: boolean;
  onPlace(on: boolean): void;
  onJump(target: { page: number; highlight?: Highlight; note?: PageNote }): void;
}) {
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const list = useMemo(() => {
    const hs = ann.highlights.filter((h) => !color || h.color === color).map((h) => ({ page: h.page, y: h.rects[0]?.y ?? 0, h, n: null as PageNote | null }));
    const ns = color ? [] : ann.notes.map((n) => ({ page: n.page, y: n.y, h: null as Highlight | null, n }));
    return [...hs, ...ns].sort((a, b) => a.page - b.page || a.y - b.y);
  }, [ann.highlights, ann.notes, color]);

  const counts = useMemo(() => Object.fromEntries(COLORS.map((c) => [c.id, ann.highlights.filter((h) => h.color === c.id).length])), [ann.highlights]);
  const total = ann.highlights.length + ann.notes.length;

  return (
    <div className="rd-notes">
      <div className="rd-notes-tools">
        <span className="rd-notes-filter" role="group" aria-label="Filter by color">
          <button type="button" className="rd-chip" aria-pressed={!color} onClick={() => setColor(null)}>
            All {total > 0 && <small>{total}</small>}
          </button>
          {COLORS.filter((c) => counts[c.id]).map((c) => (
            <button key={c.id} type="button" className={`rd-chip rd-chip-color c-${c.id}`} aria-pressed={color === c.id} onClick={() => setColor(color === c.id ? null : c.id)} title={c.label}>
              <i /> <small>{counts[c.id]}</small>
            </button>
          ))}
        </span>
        <span className="rd-grow" />
        {!disabled && (
          <button type="button" className={`btn btn-sm ${placing ? 'btn-thread' : 'btn-ghost'}`} onClick={() => onPlace(!placing)} title="Click on a page to place a note">
            <Icon name="plus" /> {placing ? 'Click on a page…' : 'Page note'}
          </button>
        )}
        {total > 0 && (
          <span className="rd-notes-export">
            <a className="btn btn-ghost btn-sm" href={readerUrl(paperId, '/highlights/export?format=md')} download>
              <Icon name="download" /> Markdown
            </a>
            <a className="btn btn-ghost btn-sm" href={readerUrl(paperId, '/highlights/export?format=txt')} download>
              Text
            </a>
          </span>
        )}
      </div>

      {disabled && <p className="rd-notes-off">{disabled}</p>}
      {!ann.loaded ? (
        <p className="rd-muted">Loading…</p>
      ) : !list.length ? (
        <div className="rd-empty">
          <Icon name="pencil" />
          <b>{color ? 'No highlights in this color' : 'No highlights or notes yet'}</b>
          {!color && <p>Select text in the PDF and pick a color to highlight it. Use Page note to stick a note anywhere on a page.</p>}
        </div>
      ) : (
        <ol className="rd-notes-list">
          {list.map(({ page, h, n }) => {
            const id = (h?.id ?? n?.id)!;
            const isEditing = editing === id;
            const lost = h != null && missing.has(h.id);
            return (
              <li key={id} className={`rd-note-item${h ? ` c-${h.color}` : ' is-page-note'}${lost ? ' is-lost' : ''}`}>
                <button type="button" className="rd-note-main" onClick={() => onJump({ page, highlight: h ?? undefined, note: n ?? undefined })}>
                  <span className="rd-note-page">p. {page}</span>
                  {h ? <q className="rd-note-quote">{h.quote}</q> : <span className="rd-note-text">{n!.text}</span>}
                  {h?.note && !isEditing && <span className="rd-note-text">{h.note}</span>}
                  {lost && <span className="rd-note-lost">Couldn’t find this text in the current PDF</span>}
                </button>
                {isEditing ? (
                  <form
                    className="rd-noteform"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (h) void ann.changeHighlight(h.id, { note: draft.trim() || null });
                      else if (draft.trim()) void ann.changeNote(n!.id, { text: draft.trim() });
                      setEditing(null);
                    }}
                  >
                    <textarea autoFocus rows={3} maxLength={5000} value={draft} placeholder="Write a note…" onChange={(e) => setDraft(e.target.value)} />
                    <div className="rd-noteform-acts">
                      <span className="rd-grow" />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-thread btn-sm">
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <span className="rd-note-acts">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={h ? (h.note ? 'Edit note' : 'Add a note') : 'Edit note'}
                      title={h ? (h.note ? 'Edit note' : 'Add a note') : 'Edit note'}
                      onClick={() => {
                        setEditing(id);
                        setDraft((h ? h.note : n!.text) ?? '');
                      }}
                    >
                      <Icon name="pencil" />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Delete" title="Delete" onClick={() => (h ? ann.removeHighlight(h.id) : ann.removeNote(n!.id))}>
                      <Icon name="trash" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
