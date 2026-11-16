import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Footer, Nav } from '@/components/Nav';
import { SharedTrace } from '@/components/share/SharedTrace';
import { pool } from '@/lib/db';
import { DEFAULT_THEME, isShareMode, isShareTheme, themeMeta } from '@/lib/share-themes';
import { buildShareView } from '@/lib/share-view';
import { STYLES } from '@/lib/styles';
import type { Result, Source } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; title: string; style: string; mode: string; shareStyle: string | null; shareMode: string | null; shareTheme: string | null; savedAt: Date;
  data: { draft: string; result: Omit<Result, 'db'> & { db: [string, Source][] } }; owner: string | null;
};

const load = cache(async (token: string) => {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const { rows } = await pool.query<Row>(
    `select t.id, t.title, t.style, t.mode, t."shareStyle", t."shareMode", t."shareTheme", t."savedAt", t.data, u.name as owner
     from trace t join "user" u on u.id = t."userId" where t."shareToken" = $1`,
    [token],
  );
  return rows[0] || null;
});

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await load((await params).token);
  return {
    title: row ? row.title : 'Shared trace',
    description: row ? `A cited draft with real, verifiable sources, shared from Citezeno.` : undefined,
    robots: { index: false, follow: false },
  };
}

/* The public, read-only view of a trace, in the design its owner chose.
   Viewers can still switch the citation style (?style=). */
export default async function SharedTracePage({ params, searchParams }: Props) {
  const { token } = await params;
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
