'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { refreshCredits, useCredits } from '../useCredits';

/* Polls the balance until the webhook has added the purchased credits (up to a minute). */
export function PurchaseWatcher({ startPaid }: { startPaid: number }) {
  const b = useCredits();
  const [tries, setTries] = useState(0);
  const arrived = b ? b.paid > startPaid : false;

  useEffect(() => {
    if (arrived || tries > 20) return;
    const t = setTimeout(() => {
      refreshCredits();
      setTries((n) => n + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [arrived, tries]);

  return (
    <>
      <div className="big-icon">
        <Icon name={arrived ? 'check' : 'bolt'} />
      </div>
      <h1>{arrived ? 'Credits added' : 'Payment received'}</h1>
      <p className="sub">
        {arrived
          ? `You now have ${b!.total.toLocaleString()} credits. Thanks for supporting Citezeno.`
          : tries > 20
            ? 'Your credits are taking longer than usual. They’ll appear in your balance shortly. A receipt is on its way by email.'
            : 'Adding the credits to your account. This usually takes a few seconds…'}
      </p>
      <Link className="btn btn-thread" href="/studio" style={{ width: '100%' }}>
        Open the studio
      </Link>
      <p className="auth-alt">
        <Link href="/account#billing">See your balance and receipts</Link>
      </p>
    </>
  );
}
