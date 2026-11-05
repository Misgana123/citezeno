'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from '../toast';

export function ClearHistory() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>
        Clear history
      </button>
    );
  return (
    <span className="hist-confirm">
      <span className="small">Remove all activity? Credit records stay.</span>
      <button
        className="btn btn-danger btn-sm"
        onClick={async () => {
          const res = await fetch('/api/history', { method: 'DELETE' });
          setConfirm(false);
          if (!res.ok) return toast('Couldn’t clear the history. Try again.', true);
          toast('History cleared');
          router.refresh();
        }}
      >
        Clear
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </span>
  );
}
