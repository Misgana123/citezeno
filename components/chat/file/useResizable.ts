'use client';

import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { usePersistent } from '../../usePersistent';

/* The file panel's width, dragged from its left edge and remembered in this
   browser. 0 means the default share of the space. The chat keeps at least
   CHAT_MIN beside it; the panel is between PANEL_MIN and MAX_SHARE wide. */

export const PANEL_MIN = 380;
export const CHAT_MIN = 340;
const MAX_SHARE = 0.72;
export const DEFAULT_SHARE = 0.46;

export function clampWidth(w: number, total: number): number {
  const max = Math.max(PANEL_MIN, Math.min(total * MAX_SHARE, total - CHAT_MIN));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, w)));
}

export function useResizable(split: RefObject<HTMLElement | null>) {
  const [saved, setSaved] = usePersistent<{ width: number }>('chat:file-panel', { width: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);

  const total = () => split.current?.getBoundingClientRect().width ?? 1200;
  const current = () => (saved.width ? saved.width : total() * DEFAULT_SHARE);
  const setWidth = useCallback((w: number) => setSaved({ width: clampWidth(w, split.current?.getBoundingClientRect().width ?? 1200) }), [setSaved, split]);

  const handle = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      start.current = { x: e.clientX, w: current() };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => start.current && setWidth(start.current.w + (start.current.x - e.clientX)),
    onPointerUp: () => {
      start.current = null;
      setDragging(false);
    },
    onPointerCancel: () => {
      start.current = null;
      setDragging(false);
    },
    onDoubleClick: () => setSaved({ width: 0 }),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setWidth(current() + 32);
      else if (e.key === 'ArrowRight') setWidth(current() - 32);
      else return;
      e.preventDefault();
    },
  };

  const style = saved.width ? { width: `${saved.width}px` } : { width: `${DEFAULT_SHARE * 100}%` };
  const share = Math.round(((saved.width || total() * DEFAULT_SHARE) / total()) * 100);
  return { style, handle, dragging, share };
}
