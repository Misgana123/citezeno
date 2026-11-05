'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient, authMessage, useSession } from '@/lib/auth-client';
import { toast } from '../toast';

/* Opens Polar's hosted checkout for one product. Signed-out visitors are sent to sign up first. */
export function BuyButton({ productId, label, featured }: { productId: string; label: string; featured?: boolean }) {
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(useSession().data);
  const cls = `btn ${featured ? 'btn-thread' : 'btn-ghost'}`;
  if (!signedIn)
    return (
      <Link className={cls} href="/sign-up?next=/pricing">
        Sign up to buy
      </Link>
    );
  const go = async () => {
    setBusy(true);
    const { error } = await authClient.checkout({ products: [productId] });
    if (error) {
      setBusy(false);
      toast(authMessage(error, 'Checkout couldn’t open. Try again in a moment.'), true);
    }
  };
  return (
    <button className={cls} onClick={go} disabled={busy}>
      {busy ? 'Opening checkout…' : label}
    </button>
  );
}

export function FreePlanButton() {
  const signedIn = Boolean(useSession().data);
  return signedIn ? (
    <Link className="btn btn-ghost" href="/studio">
      Open the studio
    </Link>
  ) : (
    <Link className="btn btn-ghost" href="/sign-up">
      Create a free account
    </Link>
  );
}

export function PortalButton({ className = 'btn btn-ghost btn-sm' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { error } = await authClient.customer.portal();
    if (error) {
      setBusy(false);
      toast(authMessage(error, 'The billing portal couldn’t open. If you haven’t bought credits yet, there’s nothing there.'), true);
    }
  };
  return (
    <button className={className} onClick={go} disabled={busy}>
      {busy ? 'Opening…' : 'Receipts and subscriptions'}
    </button>
  );
}
