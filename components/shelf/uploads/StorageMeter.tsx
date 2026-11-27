'use client';

import { useEffect, useState } from 'react';
import { shelfFetch } from '../api';
import { fileSize } from '../pdf/upload';

type Usage = { usedBytes: number; limitBytes: number; enabled: boolean };

/* How much PDF storage is used, with a way into the file manager. Reloads
   when `version` changes (after uploads and deletions). */
export function StorageMeter({ version, onManage }: { version: number; onManage: () => void }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    shelfFetch<Usage>('/api/shelf/pdfs', { signal: ctl.signal })
      .then(setU)
      .catch(() => {});
    return () => ctl.abort();
  }, [version]);
  if (!u?.enabled) return null;
  const pct = Math.min(100, (u.usedBytes / Math.max(1, u.limitBytes)) * 100);
  // "11.3 of 500 MB" (or "410 KB of 500 MB"): the limit is a round number of MB
  const used = fileSize(u.usedBytes).replace(/ MB$/, '');
  const limit = `${Math.round(u.limitBytes / 1048576)} MB`;
  return (
    <button type="button" className="sh-storage" onClick={onManage} title="Manage your PDFs">
      <span>Storage</span>
      <span className="sh-bar" role="meter" aria-label="PDF storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <i style={{ width: `${pct}%` }} className={pct > 90 ? 'is-full' : undefined} />
      </span>
      <span>
        {used} of {limit}
      </span>
    </button>
  );
}
