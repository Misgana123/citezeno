import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Footer, Nav } from '@/components/Nav';
import { SharedTrace } from '@/components/share/SharedTrace';
import { ShareExpired, SharePasswordForm } from '@/components/share/ShareGate';
import { pool } from '@/lib/db';
import { isExpired } from '@/lib/share-access';
import { isUnlocked, shareSecret, unlockCookie } from '@/lib/share-unlock';
import { DEFAULT_THEME, isShareMode, isShareTheme, themeMeta } from '@/lib/share-themes';
import { buildShareView } from '@/lib/share-view';
import { STYLES } from '@/lib/styles';
import type { Result, Source } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; title: string; style: string; mode: string; shareStyle: string | null; shareMode: string | null; shareTheme: string | null; savedAt: Date;
  data: { draft: string; result: Omit<Result, 'db'> & { db: [string, Source][] } }; owner: string | null;
};

const validToken = (token: string) => /^[\w-]{10,40}$/.test(token);

/* Can this browser see the trace? Only the access columns are read here, so a
   locked or expired link never loads the trace itself. Protected links need the
   unlock cookie set by /api/share/[token]/unlock. */
const gate = cache(async (token: string): Promise<'missing' | 'open' | 'expired' | 'locked'> => {
  if (!validToken(token)) return 'missing';
  // the page only ever sees a fingerprint of the password hash, never the hash
  const { rows } = await pool.query<{ shareExpiresAt: Date | null; pwTag: string | null }>(
    `select "shareExpiresAt", md5("sharePassword") as "pwTag" from trace where "shareToken" = $1`,
    [token],
  );
  const r = rows[0];
  if (!r) return 'missing';
  if (isExpired(r.shareExpiresAt)) return 'expired';
  if (!r.pwTag) return 'open';
  const jar = await cookies();
  return isUnlocked(shareSecret(), token, r.pwTag, jar.get(unlockCookie(token))?.value) ? 'open' : 'locked';
});

/* The trace itself, once the gate is open. */
const load = cache(async (token: string) => {
  if (!validToken(token)) return null;
  const { rows } = await pool.query<Row>(
    `select t.id, t.title, t.style, t.mode, t."shareStyle", t."shareMode", t."shareTheme", t."savedAt", t.data, u.name as owner
     from trace t join "user" u on u.id = t."userId" where t."shareToken" = $1`,
    [token],
  );
  return rows[0] || null;
});

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = (await params).token;
  const can = await gate(token);
  // an expired or locked link doesn't reveal its title
  const row = can === 'open' ? await load(token) : null;
  return {
    title: row ? row.title : 'Shared trace',
    description: can !== 'missing' ? `A cited draft with real, verifiable sources, shared from Citezeno.` : undefined,
    robots: { index: false, follow: false },
  };
}

/* The public, read-only view of a trace, in the design its owner chose.
   Viewers can still switch the citation style (?style=). */
export default async function SharedTracePage({ params, searchParams }: Props) {
  const { token } = await params;
  const can = await gate(token);
  if (can === 'missing') notFound();
  if (can !== 'open') {
    return (
      <>
        <Nav />
        <main className="sh-page sh-gate">{can === 'expired' ? <ShareExpired /> : <SharePasswordForm token={token} />}</main>
        <Footer />
      </>
    );
  }
  const row = await load(token);
  if (!row) notFound();
  pool.query(`update trace set "shareViews" = "shareViews" + 1 where "shareToken" = $1`, [token]).catch(() => {});

  const q = (await searchParams).style;
  const style = typeof q === 'string' && STYLES[q] ? q : STYLES[row.shareStyle || ''] ? row.shareStyle! : STYLES[row.style] ? row.style : 'apa';
  const mode = isShareMode(row.shareMode) ? row.shareMode : isShareMode(row.mode) ? row.mode : 'intext';
  const theme = isShareTheme(row.shareTheme) ? row.shareTheme : DEFAULT_THEME;
  const result: Result = { ...row.data.result, db: new Map(row.data.result.db) };
  const view = buildShareView({ title: row.title, owner: row.owner, savedAt: row.savedAt, style, mode, result });
  const dark = themeMeta(theme).dark;

  return (
    <>
      <Nav onBlue={dark} />
      <main className={`sh-page${dark ? ' sh-blue' : ''}`}>
        <SharedTrace theme={theme} view={view} tools={{ style, bib: view.bib }} />
      </main>
      <Footer />
    </>
  );
}
