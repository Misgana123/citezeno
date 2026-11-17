'use client';

import { useState } from 'react';
import { fetchRemote } from '@/lib/cloud';
import { saveBlob } from '@/lib/docmodel';
import { archiveName, buildArchive, collectFull } from '@/lib/export-all';
import type { Saved } from '@/lib/library';
import { Icon } from '../Icon';
import { toast } from '../toast';

type Row = { id: string; title: string; result?: Saved['result'] };

/* "Download all drafts": every trace's draft, bibliography and data in one .zip,
   made in the browser. Rows without their data are fetched from the account. */
export function DownloadAll({ items, className = 'btn btn-ghost btn-sm' }: { items: Row[]; className?: string }) {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  const go = async () => {
    if (busy || !items.length) return;
    setBusy({ done: 0, total: items.length });
    try {
      const { saved, failed } = await collectFull(items, fetchRemote, (done, total) => setBusy({ done, total }));
      if (!saved.length) throw new Error('None of your traces could be loaded. Check your connection and try again.');
      // let the progress label paint before the archive is assembled
      await new Promise((r) => setTimeout(r, 20));
      saveBlob(buildArchive(saved), 'application/zip', archiveName());
      if (failed.length) toast(`Downloaded ${saved.length} trace${saved.length === 1 ? '' : 's'}. ${failed.length} couldn’t be loaded: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`, true);
      else toast(`Downloaded ${saved.length} trace${saved.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <button type="button" className={className} onClick={go} disabled={!!busy || !items.length} title="A .zip with each trace’s draft, bibliography and full data">
      <Icon name="download" />
      {busy ? `Preparing ${busy.done} of ${busy.total}…` : 'Download all drafts'}
    </button>
  );
}

/* Shown once an account library is close to its limit. */
export function LibraryNearlyFull({ count, max }: { count: number; max: number }) {
  return (
    <p className="lib-full" role="status">
      <Icon name="alert" />
      <span>
        Your library holds <b>{count}</b> of {max} traces. Once it’s full, saving a new trace removes the oldest one, and
        we’ll ask you first. Download or delete old traces to make room.
      </span>
    </p>
  );
}
