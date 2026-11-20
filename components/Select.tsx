'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/* The app's dropdown, in place of the native <select>: a button that opens a
   listbox in a portal (so dialogs and labels never clip or swallow it), with
   groups, a check on the chosen option, and the keyboard of a real select
   (arrows, Home/End, Enter/Space, Escape, type to jump). */

export type SelectValue = string | number;
export type SelectOption<V extends SelectValue = string> = { value: V; label: string; disabled?: boolean };
export type SelectGroup<V extends SelectValue = string> = { label: string; options: SelectOption<V>[] };
export type SelectItems<V extends SelectValue = string> = (SelectOption<V> | SelectGroup<V>)[];

type Props<V extends SelectValue> = {
  value: V;
  onChange: (value: V) => void;
  options: SelectItems<V>;
  /* Shown when no option matches the value (action menus such as "Move to…"). */
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
};

const isGroup = <V extends SelectValue>(o: SelectOption<V> | SelectGroup<V>): o is SelectGroup<V> => 'options' in o;

export function Select<V extends SelectValue>({ value, onChange, options, placeholder, className = 'select', menuClassName, disabled, id, ...aria }: Props<V>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; minWidth: number; maxHeight: number } | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const flat = useMemo(() => options.flatMap((o) => (isGroup(o) ? o.options : [o])), [options]);
  const selected = flat.findIndex((o) => o.value === value);
  const shown = selected >= 0 ? flat[selected].label : (placeholder ?? '');

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8));
    setPos(
      up
        ? { left, bottom: window.innerHeight - r.top + 6, minWidth: r.width, maxHeight: Math.min(320, above) }
        : { left, top: r.bottom + 6, minWidth: r.width, maxHeight: Math.min(320, below) },
    );
  }, []);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < flat.length; i += dir) if (!flat[i].disabled) return i;
    return from;
  };
  const first = () => step(-1, 1);
  const last = () => step(flat.length, -1);

  const show = (at?: number) => {
    if (disabled) return;
    place();
    setActive(at ?? (selected >= 0 ? selected : first()));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const choose = (i: number) => {
    const o = flat[i];
    if (!o || o.disabled) return;
    close();
    if (o.value !== value) onChange(o.value);
  };

  const typeahead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 700 ? key : t.text + key;
    t.at = now;
    const q = t.text.toLowerCase();
    const start = open ? active : selected;
    const order = flat.map((_, i) => (start + 1 + i) % flat.length);
    const hit = order.find((i) => !flat[i].disabled && flat[i].label.toLowerCase().startsWith(q));
    return hit;
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onMove = () => place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      /* The trigger (or a <label> around it) toggles on its own click. */
      if (list.current?.contains(t) || btn.current?.closest('label')?.contains(t) || btn.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const hit = typeahead(e.key);
      if (hit !== undefined && flat[hit].value !== value) onChange(flat[hit].value);
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => step(a, 1)),
      ArrowUp: () => setActive((a) => step(a, -1)),
      Home: () => setActive(first()),
      End: () => setActive(last()),
      PageDown: () => setActive((a) => [...Array(8)].reduce((x) => step(x, 1), a)),
      PageUp: () => setActive((a) => [...Array(8)].reduce((x) => step(x, -1), a)),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => close(),
    };
    if (e.key === 'Tab') return close(false);
    if (keys[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      keys[e.key]();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const hit = typeahead(e.key);
      if (hit !== undefined) setActive(hit);
    }
  };

  let n = -1;
  const renderOption = (o: SelectOption<V>) => {
    const i = ++n;
    const on = i === selected;
    return (
      <div
        key={`${i}-${o.value}`}
        id={`${uid}-o${i}`}
        data-i={i}
        role="option"
        aria-selected={on}
        aria-disabled={o.disabled || undefined}
        className={`cz-opt${i === active ? ' is-active' : ''}`}
        onPointerMove={() => !o.disabled && active !== i && setActive(i)}
        onClick={() => choose(i)}
      >
        <span>{o.label}</span>
        {on && <Icon name="check" />}
      </div>
    );
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className={`${className} cz-select${open ? ' is-open' : ''}${selected < 0 ? ' is-placeholder' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria['aria-label']}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        <span className="cz-select-val">{shown}</span>
        <Icon name="chevron" className="cz-select-chev" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={aria['aria-label']}
            aria-activedescendant={active >= 0 ? `${uid}-o${active}` : undefined}
            className={`cz-select-pop${pos.bottom !== undefined ? ' is-up' : ''}${menuClassName ? ` ${menuClassName}` : ''}`}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
            onKeyDown={onListKey}
          >
            {options.map((o, gi) =>
              isGroup(o) ? (
                o.options.length > 0 && (
                  <div key={`g${gi}`} role="group" aria-label={o.label}>
                    <p className="cz-opt-group">{o.label}</p>
                    {o.options.map(renderOption)}
                  </div>
                )
              ) : (
                renderOption(o)
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
