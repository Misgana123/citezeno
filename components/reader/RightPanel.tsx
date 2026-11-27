'use client';

import { useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';

export type RightTab = 'chat' | 'notes' | 'details';

export const RIGHT_TABS: { id: RightTab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'notes', label: 'Notes', icon: 'pencil' },
  { id: 'details', label: 'Details', icon: 'doc' },
];

/* The right panel: Chat, Notes and Details. Resizable from its left edge (the
   width is remembered) and hideable; on tablets it is a drawer over the PDF. */
export function RightPanel({
  tab,
  onTab,
  width,
  onWidth,
  drawer,
  onClose,
  children,
}: {
  tab: RightTab;
  onTab(t: RightTab): void;
  width: number;
  onWidth(w: number): void;
  drawer: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <aside className={`rd-right${drawer ? ' is-drawer' : ''}`} style={drawer ? undefined : { width }} aria-label="Chat, notes and details">
      {!drawer && (
        <div
          className="rd-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the panel"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') onWidth(width + 24);
            if (e.key === 'ArrowRight') onWidth(width - 24);
          }}
          onPointerDown={(e) => {
            start.current = { x: e.clientX, w: width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current && onWidth(start.current.w + (start.current.x - e.clientX))}
          onPointerUp={() => (start.current = null)}
        />
      )}
      <div className="rd-right-head">
        <nav className="rd-tabs" role="tablist">
          {RIGHT_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </nav>
        {drawer && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the panel">
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="rd-right-body">{children}</div>
    </aside>
  );
}
