import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/docs/CopyButton';
import { DocBlocks } from '@/components/docs/DocBlocks';
import { DocFeedback } from '@/components/docs/DocFeedback';
import { DocsSearch, SearchTrigger } from '@/components/docs/DocsSearch';
import { DocsToc } from '@/components/docs/DocsToc';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { DOC_ARTICLES, DOC_CATEGORIES, docArticle, docCategory, docHeadings, docHref, docSearchIndex, docsIn } from '@/lib/docs';
import { pageMeta } from '@/lib/seo';
import '../docs.css';

/* One page per guide, built at deploy time from lib/docs.ts. */

export const dynamicParams = false;
export function generateStaticParams() {
  return DOC_ARTICLES.map((d) => ({ slug: d.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = docArticle(slug);
  if (!d) return {};
  return pageMeta({ title: `${d.title} · Docs`, description: d.summary, path: docHref(slug), ogType: 'article' });
}

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const d = docArticle(slug);
  if (!d) notFound();
  const cat = docCategory(d.category);
  const n = docsIn(d.category).indexOf(d) + 1;
  const at = DOC_ARTICLES.indexOf(d);
  const prev = DOC_ARTICLES[at - 1];
  const next = DOC_ARTICLES[at + 1];
  const headings = docHeadings(d);
  const title =
    d.em && d.title.endsWith(d.em) ? (
      <>
        {d.title.slice(0, -d.em.length)}
        <em>{d.em}.</em>
      </>
    ) : (
      d.title
    );

  return (
    <>
      <Nav />
      <main className="dk" id="top">
        <aside className="dk-side" aria-label="Docs">
          <SearchTrigger className="dk-find">
            <Icon name="search" className="ic" />
            <span className="ph-t">Search</span>
            <kbd className="dk-kbd">⌘K</kbd>
          </SearchTrigger>
          <nav>
            {DOC_CATEGORIES.map((c) => (
              <div key={c.key} className="dk-group">
                <b>{c.title}</b>
                <ul>
                  {docsIn(c.key).map((x) => (
                    <li key={x.slug}>
                      <Link href={docHref(x.slug)} className={x.slug === slug ? 'on' : undefined} aria-current={x.slug === slug ? 'page' : undefined}>
                        {x.title}
                        {x.isNew && <em>New</em>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="dk-side-card">
            <b>Still stuck?</b>
            <p>A person reads every message.</p>
            <Link href="/contact">Contact us →</Link>
          </div>
        </aside>

        <article className="dk-main">
          <nav className="dk-crumbs" aria-label="Breadcrumb">
            <Link href="/docs">Docs</Link>
            <Icon name="chevron" className="ic" />
            <Link href={docHref(docsIn(cat.key)[0].slug)}>{cat.title}</Link>
            <Icon name="chevron" className="ic" />
            <span aria-current="page">{d.title}</span>
          </nav>
          <header className="dk-title">
            <span className="kicker">
              {cat.title} · {String(n).padStart(2, '0')}
            </span>
            <h1>{title}</h1>
            <p className="dk-lede">{d.summary}</p>
            <div className="dk-meta">
              <span>
                <Icon name="clock" className="ic" />
                {d.minutes} min read
              </span>
              <span>
                <Icon name="calendar" className="ic" />
                Updated {dateLabel(d.updated)}
              </span>
              <CopyButton label="Copy link" />
            </div>
          </header>

          <DocBlocks blocks={d.blocks} />

          <DocFeedback />
          <nav className="dk-pager" aria-label="More guides">
            {prev ? (
              <Link href={docHref(prev.slug)}>
                <small>← Previous</small>
                <b>{prev.title}</b>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={docHref(next.slug)} className="is-next">
                <small>Next →</small>
                <b>{next.title}</b>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </article>

        <DocsToc headings={headings} />
      </main>
      <DocsSearch items={docSearchIndex()} />
      <Footer />
    </>
  );
}
