import { describe, expect, it } from 'vitest';
import { addSource, citedOrder, removeSource, render, replaceSource } from '@/lib/engine';
import { COALESCE_MS, UNDO_LIMIT, emptyHistory, isTextTarget, record, redo, undo, undoKey, type History } from '@/lib/undo';
import type { Result, Source } from '@/lib/types';
import { alt, makeResult } from './fixtures/trace';

describe('undo history', () => {
  it('undoes and redoes in order', () => {
    let h = emptyHistory<number>();
    let v = 0;
    for (const n of [1, 2, 3]) {
      h = record(h, v, `set ${n}`);
      v = n;
    }
    let u = undo(h, v)!;
    expect(u.value).toBe(2);
    expect(u.label).toBe('set 3');
    u = undo(u.history, u.value)!;
    expect(u.value).toBe(1);
    const r = redo(u.history, u.value)!;
    expect(r.value).toBe(2);
    expect(r.label).toBe('set 2');
    expect(redo(redo(r.history, r.value)!.history, 3)).toBeNull();
  });

  it('keeps at least 20 steps', () => {
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(20);
    let h = emptyHistory<number>();
    for (let i = 0; i < UNDO_LIMIT + 10; i++) h = record(h, i, 'x', undefined, i * 10_000);
    expect(h.past.length).toBe(UNDO_LIMIT);
    // the oldest steps are the ones dropped
    expect(h.past[0].value).toBe(10);
  });

  it('a new edit clears the redo steps', () => {
    let h = record(emptyHistory<string>(), 'a', 'edit');
    const u = undo(h, 'b')!;
    expect(u.history.future).toHaveLength(1);
    h = record(u.history, u.value, 'other');
    expect(h.future).toHaveLength(0);
  });

  it('folds quick edits to the same field into one step', () => {
    let h = emptyHistory<string>();
    h = record(h, '', 'page number changed', 'pin:x', 1000);
    h = record(h, '4', 'page number changed', 'pin:x', 1000 + COALESCE_MS / 2);
    h = record(h, '43', 'page number changed', 'pin:x', 1000 + COALESCE_MS);
    expect(h.past).toHaveLength(1);
    expect(undo(h, '437')!.value).toBe('');
    // a different field, or a pause, starts a new step
    h = record(h, '437', 'page number changed', 'pin:y', 1000 + COALESCE_MS * 1.5);
    expect(h.past).toHaveLength(2);
    h = record(h, '9', 'page number changed', 'pin:y', 1000 + COALESCE_MS * 5);
    expect(h.past).toHaveLength(3);
  });

  it('nothing to undo returns null', () => {
    expect(undo(emptyHistory(), 1)).toBeNull();
    expect(redo(emptyHistory(), 1)).toBeNull();
  });
});

describe('undo keys', () => {
  const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    undoKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

  it('maps Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z', () => {
    expect(k('z', { ctrlKey: true })).toBe('undo');
    expect(k('z', { metaKey: true })).toBe('undo');
    expect(k('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(k('z', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(k('y', { ctrlKey: true })).toBe('redo');
    expect(k('z')).toBeNull();
    expect(k('z', { ctrlKey: true, altKey: true })).toBeNull();
    expect(k('a', { ctrlKey: true })).toBeNull();
  });

  it('leaves text fields alone', () => {
    expect(isTextTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTextTarget({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});

/* Undo restores exactly what citations, the bibliography, the map and insights read. */
describe('undo with real source edits', () => {
  const snapshot = (r: Result) => {
    const rd = render(r, 'ieee', 'intext', {});
    return { order: citedOrder(r), doc: rd.docPlain, refs: rd.refPlain, list: rd.list.map((s) => s.id), pins: r.pins || {} };
  };

  it('swap, remove, add and page number all undo and redo', () => {
    const start = makeResult();
    let h: History<Result> = emptyHistory();
    let cur = start;
    const apply = (next: Result, label: string, key?: string, at?: number) => {
      h = record(h, cur, label, key, at);
      cur = next;
    };

    apply(replaceSource(cur, 'doi:10.1002/qj.49710845502', alt().id!)!, 'source replaced', undefined, 0);
    const afterSwap = snapshot(cur);
    expect(afterSwap.refs).toContain('Street trees');
    apply(removeSource(cur, 't:climate and the city:2019'), 'source removed', undefined, 10_000);
    const extra: Source = { provider: 'Crossref', type: 'article', title: 'Cool roofs in hot cities', authors: [{ family: 'Akbari', given: 'H.' }], year: 2009, doi: '10.1000/roofs' };
    apply(addSource(cur, extra, 1).result, 'source added', undefined, 20_000);
    expect(snapshot(cur).refs).toContain('Cool roofs');
    apply({ ...cur, pins: { [alt().id!]: '12' } }, 'page number changed', `pin:${alt().id}`, 30_000);
    expect(snapshot(cur).doc).toContain('12');

    // undo everything, step by step, back to the original trace
    const labels: string[] = [];
    for (let s = undo(h, cur); s; s = undo(h, cur)) {
      labels.push(s.label);
      h = s.history;
      cur = s.value;
    }
    expect(labels).toEqual(['page number changed', 'source added', 'source removed', 'source replaced']);
    expect(snapshot(cur)).toEqual(snapshot(start));

    // and redo it all
    for (let s = redo(h, cur); s; s = redo(h, cur)) {
      h = s.history;
      cur = s.value;
    }
    expect(snapshot(cur).refs).toContain('Cool roofs');
    expect(snapshot(cur).refs).not.toContain('Climate and the City');
    expect(snapshot(cur).pins).toEqual({ [alt().id!]: '12' });
  });
});
