'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLab } from '../labs/useLab';
import { Icon } from '../Icon';
import { setShelfSpace } from './api';

/* Which shelf the page shows: yours, your lab's, or a lab where you're a guest.
   The choice is remembered in this browser; the page re-mounts the shelf for it. */

const KEY = 'cz:shelf-space';
export type SpaceOption = { value: string; label: string; guest: boolean };

export function useShelfSpace(): { space: string | null; options: SpaceOption[]; setSpace(v: string | null): void; label: string | null } {
  const { lab } = useLab();
  const options = useMemo<SpaceOption[]>(() => {
    const out: SpaceOption[] = [];
    if (lab?.lab) out.push({ value: `lab:${lab.lab.id}`, label: lab.lab.name, guest: false });
    for (const g of lab?.guestOf ?? []) out.push({ value: `lab:${g.id}`, label: g.name, guest: true });
    return out;
  }, [lab]);
  const [space, setState] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && options.some((o) => o.value === saved)) setState(saved);
      else if (saved && lab) setState(null);
    } catch {
      /* storage blocked */
    }
  }, [options, lab]);
  const setSpace = (v: string | null) => {
    setState(v);
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage blocked */
    }
  };
  // the shelf's requests carry it; back to the user's own shelf when the page really closes
  // (React's development double mount runs this cleanup once without leaving the page)
  setShelfSpace(space);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      setTimeout(() => !alive.current && setShelfSpace(null), 0);
    };
  }, []);
  return { space, options, setSpace, label: options.find((o) => o.value === space)?.label ?? null };
}

/* The switch at the top of the shelf's sidebar (only when the user is in a lab). */
export function SpaceSwitch({ space, options, onChange }: { space: string | null; options: SpaceOption[]; onChange(v: string | null): void }): ReactNode {
  if (!options.length) return null;
  return (
    <div className="sh-side-sec sh-spaces" role="radiogroup" aria-label="Which shelf">
      <button type="button" role="radio" aria-checked={!space} className={`sh-space${!space ? ' is-on' : ''}`} onClick={() => onChange(null)}>
        <Icon name="layers" />
        My shelf
      </button>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={space === o.value} className={`sh-space${space === o.value ? ' is-on' : ''}`} onClick={() => onChange(o.value)}>
          <Icon name="users" />
          <span>
            {o.label}
            <small>{o.guest ? 'Shared with you' : 'Lab shelf'}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
