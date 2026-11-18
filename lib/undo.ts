/* Undo and redo for edits to a trace's sources (swap, remove, add, page numbers).
   Each step stores the whole previous value: results are immutable, so a step
   only costs the few objects that changed. */

/* how many steps are kept per trace */
export const UNDO_LIMIT = 50;
/* edits to the same field this close together (say, typing a page number) are one step */
export const COALESCE_MS = 1200;

export type Step<T> = { value: T; label: string };
export type History<T> = {
  past: Step<T>[];
  future: Step<T>[];
  /* the key and time of the last recorded edit, for coalescing */
  lastKey?: string;
  lastAt?: number;
};

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/* Record that `prev` is about to be replaced by an edit called `label`.
   Edits that share `key` within COALESCE_MS fold into the step already recorded. */
export function record<T>(h: History<T>, prev: T, label: string, key?: string, now = Date.now()): History<T> {
  if (key && h.lastKey === key && h.lastAt != null && now - h.lastAt < COALESCE_MS && h.past.length) {
    return { ...h, future: [], lastAt: now };
  }
  const past = [...h.past, { value: prev, label }].slice(-UNDO_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

/* Step back: returns the value to show and the label of the edit undone. */
export function undo<T>(h: History<T>, present: T): { history: History<T>; value: T; label: string } | null {
  const step = h.past[h.past.length - 1];
  if (!step) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, { value: present, label: step.label }] },
    value: step.value,
    label: step.label,
  };
}

/* Step forward again after an undo. */
export function redo<T>(h: History<T>, present: T): { history: History<T>; value: T; label: string } | null {
  const step = h.future[h.future.length - 1];
  if (!step) return null;
  return {
    history: { past: [...h.past, { value: present, label: step.label }], future: h.future.slice(0, -1) },
    value: step.value,
    label: step.label,
  };
}

/* Ctrl+Z / Ctrl+Shift+Z (Cmd on a Mac) should not steal undo from a text field. */
export function isTextTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/* Which history action a key press asks for, if any. */
export function undoKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}
