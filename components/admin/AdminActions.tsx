'use client';

import { useState } from 'react';
import { toast } from '../toast';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

/* Inline "grant credits" control for one user row. */
export function GrantCredits({ userId, total: initial }: { userId: string; total: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('50');
  const [note, setNote] = useState('');
  const [total, setTotal] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <span className="adm-credits">
        <b>{total.toLocaleString()}</b>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Adjust
        </button>
      </span>
    );
  return (
    <form
      className="adm-grant"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await post('/api/admin/credits', { userId, amount: Number(amount), note });
          setTotal(r.total);
          setOpen(false);
          toast(`Balance is now ${r.total} credits`);
        } catch (err) {
          toast((err as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Credits to add (negative to remove)" style={{ width: 90 }} />
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
      <button className="btn btn-sm" disabled={busy}>
        Apply
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

export function HandledToggle({ id, handled: initial }: { id: string; handled: boolean }) {
  const [handled, setHandled] = useState(initial);
  return (
    <label className="check" style={{ fontSize: 13 }}>
      <input
        type="checkbox"
        checked={handled}
        onChange={async (e) => {
          const v = e.target.checked;
          setHandled(v);
          try {
            await post(`/api/admin/contact/${id}`, { handled: v });
          } catch (err) {
            setHandled(!v);
            toast((err as Error).message, true);
          }
        }}
      />
      Handled
    </label>
  );
}
