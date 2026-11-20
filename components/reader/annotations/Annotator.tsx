'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '../../toast';
import type { PdfControls } from '../pdf/PdfPane';
import { selectionAnchor, type Anchor } from './anchor';
import { AnnotationLayer, type Flash } from './AnnotationLayer';
import { HighlightMenu, PageNoteEditor, SelectionMenu, type At } from './Popovers';
import type { Annotations, Highlight, PageNote } from './useAnnotations';

/* Highlighting on the PDF: selecting text shows the selection menu (colors,
   Ask about this, Explain, Copy); clicking a highlight opens its menu; in
   page-note mode a click places a note. "H" highlights the selection in yellow. */
export function Annotator({
  pdf,
  pdfKey,
  ann,
  rendered,
  tick,
  canHighlight,
  placing,
  onPlacing,
  flash,
  onMissing,
  onAsk,
  onExplain,
}: {
  pdf: PdfControls;
  pdfKey: string | null;
  ann: Annotations;
  rendered: Set<number>;
  tick: number;
  /* the PDF has a text layer */
  canHighlight: boolean;
  placing: boolean;
  onPlacing(on: boolean): void;
  flash: Flash | null;
  onMissing(ids: Set<string>): void;
  onAsk?(quote: string, a: Anchor): void;
  onExplain?(quote: string, a: Anchor): void;
}) {
  const [sel, setSel] = useState<{ anchor: Anchor; at: At } | null>(null);
  const [open, setOpen] = useState<{ h: Highlight; at: At } | null>(null);
  const [noteEd, setNoteEd] = useState<{ note: PageNote | null; page: number; x: number; y: number; at: At } | null>(null);

  // the selection settles (mouse or touch): show the menu above it
  useEffect(() => {
    if (!canHighlight) return;
    let t: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const s = window.getSelection();
        const anchor = selectionAnchor(s);
        if (!anchor || !s?.rangeCount || !pdf.container.contains(s.anchorNode)) return setSel(null);
        const r = s.getRangeAt(0).getBoundingClientRect();
        setSel({ anchor, at: { left: r.left + r.width / 2, top: r.top } });
      }, 180);
    };
    document.addEventListener('selectionchange', onChange);
    const hide = () => setSel(null);
    pdf.container.addEventListener('scroll', hide, { passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', onChange);
      pdf.container.removeEventListener('scroll', hide);
    };
  }, [pdf, canHighlight]);

  const highlight = useCallback(
    async (color: Parameters<Annotations['addHighlight']>[1], anchor?: Anchor) => {
      const a = anchor ?? sel?.anchor ?? selectionAnchor(window.getSelection());
      if (!a) return;
      setSel(null);
      window.getSelection()?.removeAllRanges();
      await ann.addHighlight(a, color);
    },
    [sel, ann],
  );

  // "H": highlight the selection
  useEffect(() => {
    if (!canHighlight) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      const a = selectionAnchor(window.getSelection());
      if (!a) return;
      e.preventDefault();
      void highlight('yellow', a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canHighlight, highlight]);

  // page-note mode ends with Escape
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onPlacing(false);
    window.addEventListener('keydown', onKey);
    pdf.container.classList.add('is-placing');
    return () => {
      window.removeEventListener('keydown', onKey);
      pdf.container.classList.remove('is-placing');
    };
  }, [placing, onPlacing, pdf]);

  return (
    <>
      <AnnotationLayer
        pdf={pdf}
        pdfKey={pdfKey}
        rendered={rendered}
        tick={tick}
        ann={ann}
        flash={flash}
        placing={placing}
        onPlace={(page, x, y, at) => {
          onPlacing(false);
          setNoteEd({ note: null, page, x, y, at });
        }}
        onOpenHighlight={(h, at) => setOpen({ h, at })}
        onOpenNote={(note, at) => setNoteEd({ note, page: note.page, x: note.x, y: note.y, at })}
        onMissing={onMissing}
      />
      {sel && (
        <SelectionMenu
          at={sel.at}
          onClose={() => setSel(null)}
          onHighlight={(c) => highlight(c)}
          onAsk={onAsk ? () => (onAsk(sel.anchor.quote, sel.anchor), setSel(null)) : undefined}
          onExplain={onExplain ? () => (onExplain(sel.anchor.quote, sel.anchor), setSel(null)) : undefined}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(window.getSelection()?.toString() || sel.anchor.quote);
              toast('Copied');
            } catch {
              toast('Copy isn’t available here. Use Ctrl C.', true);
            }
            setSel(null);
          }}
        />
      )}
      {open && (
        <HighlightMenu
          key={open.h.id}
          h={ann.highlights.find((h) => h.id === open.h.id) ?? open.h}
          at={open.at}
          onClose={() => setOpen(null)}
          onColor={(color) => void ann.changeHighlight(open.h.id, { color })}
          onNote={(note) => void ann.changeHighlight(open.h.id, { note })}
          onDelete={() => {
            void ann.removeHighlight(open.h.id);
            setOpen(null);
          }}
        />
      )}
      {noteEd && (
        <PageNoteEditor
          note={noteEd.note}
          at={noteEd.at}
          onClose={() => setNoteEd(null)}
          onSave={(text) => {
            if (noteEd.note) void ann.changeNote(noteEd.note.id, { text });
            else void ann.addNote({ page: noteEd.page, x: noteEd.x, y: noteEd.y, text });
            setNoteEd(null);
          }}
          onDelete={
            noteEd.note
              ? () => {
                  void ann.removeNote(noteEd.note!.id);
                  setNoteEd(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
