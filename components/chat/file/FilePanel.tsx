'use client';

import { useCallback, useEffect, type RefObject } from 'react';
import { Icon } from '../../Icon';
import { FileView } from './FileView';
import type { FilePanel as Panel } from './panel-state';
import { useResizable } from './useResizable';

/* The files open beside the chat: a drag handle on its left edge (double-click
   resets the width), a tab per open file, and the shown file. Esc closes the
   panel when nothing inside it is using the key. */
export function FilePanel({ panel, split, onAsk }: { panel: Panel; split: RefObject<HTMLDivElement | null>; onAsk(text: string, paperId: string): void }) {
  const { style, handle, dragging, share } = useResizable(split);
  const { files, active, closeAll, close } = panel;

  useEffect(() => {
    if (!files.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      // the find bar, menus and popovers close themselves first
      if (t?.closest('.rd-find, .rd-pop, .cf-menu, [role="menu"], [role="dialog"]')) return;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !t.closest('.cf')) return;
      closeAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files.length, closeAll]);

  const onNamed = useCallback((title: string) => active && panel.named(active, title), [active, panel]);
  if (!files.length || !active) return null;

  return (
    <>
      <div
        className={`cf-resize${dragging ? ' is-drag' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the file panel"
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        {...handle}
      >
        <span className="cf-grip" aria-hidden="true" />
        {dragging && <span className="cf-resize-tip">{share}%</span>}
      </div>
      <div className={`cf${dragging ? ' is-dragging' : ''}`} style={style}>
        <nav className="cf-tabs" role="tablist" aria-label="Open files">
          {files.map((f) => (
            <div key={f.paperId} className={`cf-tab${f.paperId === active ? ' is-on' : ''}`} role="presentation">
              <button type="button" role="tab" aria-selected={f.paperId === active} className="cf-tab-btn" onClick={() => panel.select(f.paperId)} title={f.title ?? undefined}>
                <Icon name="file" /> <span>{f.title ?? 'Opening…'}</span>
              </button>
              <button type="button" className="cf-tab-x" onClick={() => close(f.paperId)} aria-label={`Close “${f.title ?? 'this file'}”`}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </nav>
        <FileView key={active} paperId={active} jump={panel.jump} onJumped={panel.jumped} onNamed={onNamed} onAsk={(text) => onAsk(text, active)} onClose={closeAll} />
      </div>
    </>
  );
}
