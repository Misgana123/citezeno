'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type T = { id: number; msg: string; err?: boolean };
const EVT = 'citezeno:toast';
let seq = 0;

/* Fire a toast from anywhere on the client. */
export function toast(msg: string, err = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<T>(EVT, { detail: { id: ++seq, msg, err } }));
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<T>).detail;
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>
          <Icon name={t.err ? 'alert' : 'check'} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}
