'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* An in-app replacement for window.confirm. Call it from anywhere on the client:
     if (!(await confirmDialog({ title: 'Delete “x.pdf”?', confirmLabel: 'Delete', danger: true }))) return;
   It resolves true on confirm and false on Cancel, Escape or a click outside. */
export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /* red confirm button, for deleting and removing */
  danger?: boolean;
};

type Req = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };
const EVT = 'citezeno:confirm';
let seq = 0;
let mounted = false;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  // no host on this page (should not happen): fall back to the browser's dialog
  if (!mounted) return Promise.resolve(window.confirm([opts.title, opts.body].filter(Boolean).join('\n\n')));
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Req>(EVT, { detail: { ...opts, id: ++seq, resolve } })));
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const backTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted = true;
    const on = (e: Event) => {
      const next = (e as CustomEvent<Req>).detail;
      backTo.current = document.activeElement as HTMLElement | null;
      // a new request replaces one still open (which counts as cancelled)
      setReq((prev) => {
        prev?.resolve(false);
        return next;
      });
    };
    window.addEventListener(EVT, on);
    return () => {
      mounted = false;
      window.removeEventListener(EVT, on);
    };
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      if (!req) return;
      req.resolve(ok);
      setReq(null);
      backTo.current?.focus?.();
    },
    [req],
  );

  useEffect(() => {
    if (!req) return;
    // the safe choice has focus, so a stray Enter doesn't delete anything
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // keep the dialog underneath (if any) from closing too
        e.preventDefault();
        e.stopImmediatePropagation();
        close(false);
      } else if (e.key === 'Tab') {
        // two buttons: keep focus between them
        e.preventDefault();
        (document.activeElement === cancelRef.current ? okRef : cancelRef).current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req, close]);

  if (!req) return null;
  return (
    <div className="overlay confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cz-confirm-h" aria-describedby={req.body ? 'cz-confirm-b' : undefined}>
        <h2 id="cz-confirm-h">{req.title}</h2>
        {req.body && <p id="cz-confirm-b">{req.body}</p>}
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={() => close(false)}>
            {req.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={okRef} type="button" className={`btn btn-sm ${req.danger ? 'btn-danger' : 'btn-thread'}`} onClick={() => close(true)}>
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
