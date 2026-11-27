'use client';

import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ImportSummary } from '@/lib/shelf/store/imports';
import { Icon } from '../../Icon';
import { formatCount } from '../../papers/format';
import { shelfFetch } from '../api';

/* An import on its way (from a file, or from a connected reference manager):
   kept moving while the dialog is open, its progress, then what came of it. */

export function useFollowImport(summary: ImportSummary | null, setSummary: Dispatch<SetStateAction<ImportSummary | null>>, onProgress: () => void, alive: RefObject<boolean>) {
  /* Keep asking for the next slice of work until it is done. */
  const follow = useCallback(
    async (id: string) => {
      for (let n = 0; alive.current && n < 2000; n++) {
        try {
          const s = await shelfFetch<ImportSummary>(`/api/shelf/imports/${id}/run`, { method: 'POST' });
          if (!alive.current) return;
          setSummary(s);
          onProgress();
          if (s.status === 'done') return;
        } catch {
          /* a hiccup: the background job carries on; try again shortly */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    },
    [onProgress],
  );

  useEffect(() => {
    if (summary?.status === 'queued') void follow(summary.id);
    // follow once per import
  }, [summary?.id]);
}

export function ImportSummaryView({ summary, again, onAgain }: { summary: ImportSummary; again: string; onAgain: () => void }) {
  const c = summary.counts;
  const processed = summary.total - c.pending;
  const pct = summary.total ? Math.round((processed / summary.total) * 100) : 100;
  return (
    <div className="sh-import">
      <div className="sh-up-head">
        <Icon name="doc" />
        <span className="sh-up-name">{summary.fileName}</span>
        <span className="small">{formatCount(summary.total)} references</span>
      </div>
      {summary.status === 'queued' ? (
        <div className="sh-up-progress" role="status">
          <span className="sh-bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="small">
            {formatCount(processed)} of {formatCount(summary.total)}
          </span>
        </div>
      ) : (
        <p className="sh-up-done">
          <Icon name="check" /> Import finished.
        </p>
      )}
      <ul className="sh-import-counts">
        <li>
          <b>{formatCount(c.matched)}</b> matched in OpenAlex
        </li>
        <li>
          <b>{formatCount(c.added)}</b> added as written
        </li>
        <li>
          <b>{formatCount(c.duplicate)}</b> skipped as duplicates
        </li>
        <li className={c.failed ? 'is-bad' : undefined}>
          <b>{formatCount(c.failed)}</b> failed
        </li>
      </ul>
      {summary.status === 'queued' && <p className="sh-hint">You can close this window: the import carries on in the background.</p>}
      {summary.status === 'done' && summary.failed.length > 0 && (
        <details className="sh-import-failed" open={summary.failed.length <= 10}>
          <summary>Entries that failed</summary>
          <ul>
            {summary.failed.map((f, i) => (
              <li key={`${f.label}-${i}`}>
                <b>{f.label}</b>: {f.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {summary.status === 'done' && (
        <div className="sh-dup-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAgain}>
            {again}
          </button>
        </div>
      )}
    </div>
  );
}
