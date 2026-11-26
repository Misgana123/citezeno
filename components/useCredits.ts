'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Balance } from '@/lib/pricing';

/* One shared credit balance for the whole page, so the studio bar and the
   account menu always show the same number. */

let balance: Balance | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (b: Balance | null) => {
  balance = b;
  emit();
};

export function refreshCredits() {
  loading ??= fetch('/api/credits', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => set(b?.balance ?? null))
    .catch(() => {})
    .finally(() => (loading = null));
  return loading;
}

export class OutOfCredits extends Error {
  constructor(public needed: number, public have: number) {
    super(`This needs ${needed} credit${needed === 1 ? '' : 's'} and you have ${have}.`);
  }
}

/* Hold credits for a studio search. Resolves to the action id to settle it with. */
export async function holdCredits(claims: number, kind: 'trace' | 'cite'): Promise<string> {
  const res = await fetch('/api/credits/hold', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claims, kind }) });
  const body = await res.json().catch(() => ({}));
  if (body.balance) set(body.balance);
  if (res.status === 402) throw new OutOfCredits(body.needed, body.balance?.total ?? 0);
  if (!res.ok) throw new Error(body.error || 'Couldn’t check your credits. Try again.');
  return body.actionId;
}

/* Finish a studio search: `searched` claims are charged, the rest of the hold is released. */
export async function settleCredits(actionId: string, searched: number): Promise<{ charged: number } | null> {
  try {
    const res = await fetch('/api/credits/settle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionId, searched }), keepalive: true });
    const body = await res.json().catch(() => ({}));
    if (body.balance) set(body.balance);
    return body.ok ? { charged: body.charged } : null;
  } catch {
    return null;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCredits(enabled = true) {
  const b = useSyncExternalStore(subscribe, () => balance, () => null);
  useEffect(() => {
    if (!enabled) return;
    if (!balance) refreshCredits();
    // pick up purchases made in another tab
    const on = () => document.visibilityState === 'visible' && refreshCredits();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [enabled]);
  return b;
}
