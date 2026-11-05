import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { ShareTools } from '@/components/share/ShareTools';
import { PagedSheet } from '@/components/studio/PagedSheet';
import { pool } from '@/lib/db';
import { sanitizeRendered } from '@/lib/sanitize';
import { exportText, render } from '@/lib/engine';
import { STYLES } from '@/lib/styles';
import type { Mode, Result, Source } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; title: string; style: string; mode: string; shareStyle: string | null; shareMode: string | null; savedAt: Date;
  data: { draft: string; result: Omit<Result, 'db'> & { db: [string, Source][] } }; owner: string | null;
};

const load = cache(async (token: string) => {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const { rows } = await pool.query<Row>(
    `select t.id, t.title, t.style, t.mode, t."shareStyle", t."shareMode", t."savedAt", t.data, u.name as owner
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

export default async function SharedTrace({ params, searchParams }: Props) {
  const { token } = await params;
  const row = await load(token);
  if (!row) notFound();
  pool.query(`update trace set "shareViews" = "shareViews" + 1 where "shareToken" = $1`, [token]).catch(() => {});

  const q = (await searchParams).style;
  const style = typeof q === 'string' && STYLES[q] ? q : STYLES[row.shareStyle || ''] ? row.shareStyle! : STYLES[row.style] ? row.style : 'apa';
  const mode = (row.shareMode || row.mode || 'intext') as Mode;
  const result: Result = { ...row.data.result, db: new Map(row.data.result.db) };
  const rd = render(result, style, mode, {});
  const strip = (h: string) => sanitizeRendered(h);
  const firstName = (row.owner || '').split(' ')[0];

  return (
    <>
      <Nav />
      <main className="wrap page share">
        <header className="share-head">
          <div>
            <p className="share-kicker">
              <Icon name="shield" /> Shared {firstName ? `by ${firstName} ` : ''}from Citezeno ·{' '}
              {new Date(row.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="h2">{row.title}</h1>
            <p className="lede">
              {rd.list.length} source{rd.list.length === 1 ? '' : 's'} in {STYLES[style].name} ({STYLES[style].edition}). Every
              reference links to a real record. Open each one to check it supports the sentence it’s attached to.
            </p>
          </div>
          <ShareTools style={style} bib={exportText('bibtex', rd)} />
        </header>

        {rd.effectiveMode !== 'list' && <PagedSheet html={strip(rd.docHtml)} label={`${STYLES[style].name}, ${STYLES[style].edition}`} />}

        <section className="share-refs">
          <h2 className="h3">{rd.listTitle}</h2>
          <div className="sheet sheet-flat" dangerouslySetInnerHTML={{ __html: strip(rd.refHtml) }} />
        </section>

        <aside className="cta-band" style={{ paddingBottom: 0, marginTop: 64 }}>
          <h2 className="h2" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>
            Need real sources for your own draft?
          </h2>
          <Link className="btn btn-thread" href="/sign-up">
            Try Citezeno free
          </Link>
        </aside>
      </main>
      <Footer />
    </>
  );
}
