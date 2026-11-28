'use client';

import Link from 'next/link';
import { timeAgo } from '@/lib/library';
import { Icon } from '../../Icon';
import type { AccountState } from '../useAccount';

/* Library: the traces saved to the account. */
export function LibrarySection({ account, onClose }: { account: AccountState; onClose(): void }) {
  const s = account.data!.stats;
  return (
    <section>
      <h3>Library</h3>
      <p className="st-lead">Every trace you run while signed in is saved to your account and shows in Citation on any device.</p>
      <div className="st-group">
        <div className="st-stats">
          <div className="st-stat">
            <b>{s.traces.toLocaleString()}</b>
            <span>Saved traces</span>
          </div>
          <div className="st-stat">
            <b>{s.sources.toLocaleString()}</b>
            <span>Sources cited</span>
          </div>
          <div className="st-stat">
            <b>{s.last ? timeAgo(s.last) : '—'}</b>
            <span>Last saved</span>
          </div>
        </div>
      </div>
      <Link className="st-btn" href="/app/citation" onClick={onClose}>
        Open Citation
        <Icon name="arrow" />
      </Link>
    </section>
  );
}
