'use client';

import { useEffect, useState } from 'react';
import type { LibItem } from '@/lib/cloud';
import { fetchRemote } from '@/lib/cloud';
import { saveBlob } from '@/lib/docmodel';
import { buildArchive, singleArchiveName } from '@/lib/export-all';
import { timeAgo, type Saved } from '@/lib/library';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* Asked before saving a new trace into a full library, which would push out the
   oldest one: download it first, go ahead, or don't save the new trace. */
export function EvictDialog({
  victim,
  cap,
  signedIn,
  onContinue,
  onCancel,
}: {
  victim: LibItem;
  cap: number;
  signedIn: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);

  const download = async () => {
    setBusy(true);
    try {
      const full: Saved = victim.result ? (victim as Saved) : await fetchRemote(victim.id);
      saveBlob(buildArchive([full]), 'application/zip', singleArchiveName(full));
      setDone(true);
      toast(`Downloaded “${victim.title}”`);
    } catch (e) {
      toast(`Couldn’t download it: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog evict" role="alertdialog" aria-modal="true" aria-labelledby="ev-title" aria-describedby="ev-body">
        <div className="big-icon">
          <Icon name="alert" />
        </div>
        <h2 id="ev-title">Your library is full</h2>
        <p id="ev-body">
          {signedIn ? 'Your account' : 'This browser'} keeps your {cap} most recent traces. Saving this trace will remove the
          oldest one:
        </p>
        <div className="evict-item">
          <b>{victim.title}</b>
          <span>
            Saved {timeAgo(victim.savedAt)} · {victim.sources} source{victim.sources === 1 ? '' : 's'}
          </span>
        </div>
        <p className="evict-hint">
          {done
            ? 'Downloaded. The .zip holds its draft, bibliography and full trace data.'
            : 'Download it first to keep a copy of its draft, bibliography and full trace data.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={download} disabled={busy} autoFocus={!done}>
            <Icon name={done ? 'check' : 'download'} /> {busy ? 'Preparing…' : done ? 'Downloaded' : 'Download it first'}
          </button>
          <button type="button" className="btn btn-thread btn-sm" onClick={onContinue} autoFocus={done}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
