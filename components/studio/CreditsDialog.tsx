'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '../Icon';

export function CreditsDialog({ needed, have, resetsAt, onClose }: { needed: number; have: number; resetsAt?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const reset = resetsAt ? new Date(resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-labelledby="oc-title">
        <div className="big-icon">
          <Icon name="bolt" />
        </div>
        <h2 id="oc-title">Not enough credits</h2>
        <p>
          This needs <b>{needed}</b> credit{needed === 1 ? '' : 's'} (one per claim) and you have <b>{have}</b>.{' '}
          {have > 0 && 'Lower “Sources to find” in the settings panel to trace fewer claims, or top up. '}
          {reset && `Your free credits refill on ${reset}.`}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Not now
          </button>
          <Link className="btn btn-thread btn-sm" href="/pricing">
            Get more credits
          </Link>
        </div>
      </div>
    </div>
  );
}
