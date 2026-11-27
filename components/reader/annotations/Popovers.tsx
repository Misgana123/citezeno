'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../Icon';
import { COLORS, type Highlight, type HighlightColor, type PageNote } from './useAnnotations';

/* The small floating menus over the PDF: the selection menu, a highlight's
   menu (color, note, delete) and the page-note editor. Positioned in the
   window (fixed), kept on screen, closed with Escape or a click elsewhere. */

export type At = { left: number; top: number };

function Floating({ at, onClose, children, className = '', below = false }: { at: At; onClose(): void; children: ReactNode; className?: string; below?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, at.left - w / 2));
    let top = below ? at.top + 10 : at.top - h - 10;
    if (top < 8) top = at.top + 18;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [at, below]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className={`rd-pop ${className}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }} role="dialog">
      {children}
    </div>
  );
}

function Swatches({ value, onPick }: { value?: HighlightColor; onPick(c: HighlightColor): void }) {
  return (
    <span className="rd-swatches" role="group" aria-label="Highlight color">
      {COLORS.map((c) => (
        <button key={c.id} type="button" className={`rd-swatch c-${c.id}`} aria-label={`Highlight ${c.label.toLowerCase()}`} aria-pressed={value === c.id} title={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c.id)} />
      ))}
    </span>
  );
}

/* Selecting text shows: the highlight colors, Ask about this, Explain, Copy. */
export function SelectionMenu({ at, onHighlight, onAsk, onExplain, onCopy, onClose }: { at: At; onHighlight(c: HighlightColor): void; onAsk?(): void; onExplain?(): void; onCopy(): void; onClose(): void }) {
  return (
    <Floating at={at} onClose={onClose} className="rd-selmenu">
      <Swatches onPick={onHighlight} />
      <span className="rd-pop-sep" />
      {onAsk && (
        <button type="button" className="rd-pop-btn" onMouseDown={(e) => e.preventDefault()} onClick={onAsk}>
          <Icon name="chat" /> Ask about this
        </button>
      )}
      {onExplain && (
        <button type="button" className="rd-pop-btn" onMouseDown={(e) => e.preventDefault()} onClick={onExplain}>
          <Icon name="sparkle" /> Explain
        </button>
      )}
      <button type="button" className="rd-pop-btn" onMouseDown={(e) => e.preventDefault()} onClick={onCopy}>
        <Icon name="copy" /> Copy
      </button>
    </Floating>
  );
}

/* A highlight's menu: change its color, write a note on it, delete it. */
export function HighlightMenu({ h, at, onColor, onNote, onDelete, onClose }: { h: Highlight; at: At; onColor(c: HighlightColor): void; onNote(text: string | null): void; onDelete(): void; onClose(): void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(h.note ?? '');
  return (
    <Floating at={at} onClose={onClose} className="rd-hlmenu">
      <div className="rd-pop-row">
        <Swatches value={h.color} onPick={onColor} />
        <span className="rd-pop-sep" />
        <button type="button" className="rd-pop-btn" onClick={() => setEditing(true)}>
          <Icon name="pencil" /> {h.note ? 'Edit note' : 'Add note'}
        </button>
        <button type="button" className="rd-pop-btn is-danger" onClick={onDelete} aria-label="Delete highlight">
          <Icon name="trash" />
        </button>
      </div>
      {!editing && h.note && <p className="rd-pop-note">{h.note}</p>}
      {editing && (
        <NoteForm
          value={text}
          onChange={setText}
          onCancel={() => setEditing(false)}
          onSave={() => {
            onNote(text.trim() || null);
            setEditing(false);
          }}
        />
      )}
    </Floating>
  );
}

/* Writing or editing a page note. */
export function PageNoteEditor({ note, at, onSave, onDelete, onClose }: { note: PageNote | null; at: At; onSave(text: string): void; onDelete?(): void; onClose(): void }) {
  const [text, setText] = useState(note?.text ?? '');
  return (
    <Floating at={at} onClose={onClose} className="rd-noteed" below>
      <b className="rd-pop-title">
        <Icon name="pencil" /> Page note
      </b>
      <NoteForm
        value={text}
        onChange={setText}
        onCancel={onClose}
        onSave={() => text.trim() && onSave(text.trim())}
        extra={
          onDelete && (
            <button type="button" className="btn btn-ghost btn-sm is-danger" onClick={onDelete}>
              <Icon name="trash" /> Delete
            </button>
          )
        }
      />
    </Floating>
  );
}

function NoteForm({ value, onChange, onSave, onCancel, extra }: { value: string; onChange(v: string): void; onSave(): void; onCancel(): void; extra?: ReactNode }) {
  return (
    <form
      className="rd-noteform"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <textarea
        autoFocus
        value={value}
        maxLength={5000}
        rows={3}
        placeholder="Write a note…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave();
        }}
      />
      <div className="rd-noteform-acts">
        {extra}
        <span className="rd-grow" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-thread btn-sm">
          Save
        </button>
      </div>
    </form>
  );
}
