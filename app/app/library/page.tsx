import type { Metadata } from 'next';
import { LibraryManager, type LibRow } from '@/components/library/LibraryManager';
import Link from 'next/link';
import { AppShell, PageHead } from '@/components/app/AppShell';
import { Icon } from '@/components/Icon';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Library', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const s = await requireSession('/app/library');
  const { rows } = await pool.query<Omit<LibRow, 'savedAt' | 'shareExpiresAt'> & { savedAt: Date; shareExpiresAt: Date | null }>(
    `select id, title, style, mode, sources, snippet, "savedAt", "shareToken", "shareViews", "shareExpiresAt", ("sharePassword" is not null) as "shareLocked" from trace
     where "userId" = $1 order by "savedAt" desc limit 500`,
    [s.user.id],
  );
  return (
    <AppShell current="library" title="Library">
      <PageHead
        title="Library"
        actions={
          <Link className="btn btn-thread btn-sm" href="/app/citation">
            <Icon name="plus" /> New trace
          </Link>
        }
      >
        Every trace you’ve run, synced to your account. Rename, share a read-only link, or reopen one in the studio.
      </PageHead>
      <LibraryManager initial={rows.map((r) => ({ ...r, savedAt: new Date(r.savedAt).getTime(), shareExpiresAt: r.shareExpiresAt ? new Date(r.shareExpiresAt).getTime() : null }))} owner={s.user.name || ''} />
    </AppShell>
  );
}
