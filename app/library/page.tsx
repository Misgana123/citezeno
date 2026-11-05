import type { Metadata } from 'next';
import { LibraryManager, type LibRow } from '@/components/library/LibraryManager';
import { Footer, Nav } from '@/components/Nav';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Library', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const s = await requireSession('/library');
  const { rows } = await pool.query<LibRow & { savedAt: Date }>(
    `select id, title, style, mode, sources, snippet, "savedAt", "shareToken", "shareViews" from trace
     where "userId" = $1 order by "savedAt" desc limit 500`,
    [s.user.id],
  );
  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Library</h1>
          <p className="lede">Every trace you’ve run, synced to your account. Rename, share a read-only link, or reopen one in the studio.</p>
        </header>
        <LibraryManager initial={rows.map((r) => ({ ...r, savedAt: new Date(r.savedAt).getTime() }))} />
      </main>
      <Footer />
    </>
  );
}
