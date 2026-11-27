import Link from 'next/link';
import { DocWindow } from '@/components/docs/DocBlocks';
import { DocsSearch, SearchTrigger } from '@/components/docs/DocsSearch';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { DOC_CATEGORIES, DOC_CHIPS, DOC_FEATURED, DOC_HELP, DOC_POPULAR, docArticle, docHref, docSearchIndex, docsIn } from '@/lib/docs';
import { pageMeta } from '@/lib/seo';
import './docs.css';

export const metadata = pageMeta({
  title: 'Docs: guides for every Citezeno tool',
  description: 'Guides, how-tos and answers for the research assistant, deep research, the paper reader, Shelf and the citation studio.',
  path: '/docs',
});

export default function DocsHome() {
  const featured = docArticle(DOC_FEATURED)!;
  return (
    <>
      <Nav />
      <main>
        <header className="dh-hero">
          <span className="kicker">Documentation</span>
          <h1>
            Learn Citezeno, <em>page by page.</em>
          </h1>
          <p>Guides, how-tos and answers for every tool, from your first question to a finished, cited draft.</p>
          <SearchTrigger className="dh-search">
            <Icon name="search" className="ic" />
            <span className="ph-t">Search the docs…</span>
            <kbd className="dk-kbd">⌘ K</kbd>
            <b>Search</b>
          </SearchTrigger>
          <div className="dh-chips">
            <small>Popular</small>
            {DOC_CHIPS.map((s) => {
              const d = docArticle(s)!;
              return (
                <Link key={s} href={docHref(s)}>
                  {d.title}
                </Link>
              );
            })}
          </div>
        </header>

        <section className="dh-sec" aria-labelledby="topics-title">
          <div className="dh-head">
            <div>
              <span className="kicker">Browse by topic</span>
              <h2 id="topics-title">
                Find your way <em>around.</em>
              </h2>
            </div>
            <p>Each topic has short guides you can read in a few minutes, written from how the app really works.</p>
          </div>
          <div className="dh-cats">
            {DOC_CATEGORIES.map((c, i) => {
              const list = docsIn(c.key);
              const lead = i === 0;
              const [first, ...rest] = c.title.split(' ');
              return (
                <Link key={c.key} className={`dh-cat${lead ? ' is-lead' : ''}`} href={docHref(list[0].slug)}>
                  <span className="dh-cat-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="dh-cat-ico">
                    <Icon name={c.icon} className="ic" />
                  </span>
                  <h3>
                    {lead && rest.length ? (
                      <>
                        {first} <em>{rest.join(' ')}</em>
                      </>
                    ) : (
                      c.title
                    )}
                  </h3>
                  <p>{c.blurb}</p>
                  {lead && c.steps && (
                    <div className="dh-lead-steps">
                      {c.steps.map((s, n) => (
                        <span key={s}>
                          <i>{String(n + 1).padStart(2, '0')}</i> {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="dh-cat-foot">
                    <span>
                      {list.length} {list.length === 1 ? 'guide' : 'guides'}
                    </span>
                    <Icon name="arrow" className="ic" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="dh-sec" aria-labelledby="popular-title">
          <div className="dh-head">
            <div>
              <span className="kicker">Most read</span>
              <h2 id="popular-title">
                Popular <em>guides.</em>
              </h2>
            </div>
          </div>
          <div className="dh-pop">
            <ol className="dh-list">
              {DOC_POPULAR.map((s, i) => {
                const d = docArticle(s)!;
                return (
                  <li key={s}>
                    <Link href={docHref(s)}>
                      <span className="dh-num">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <b>{d.title}</b>
                        <small>{d.summary}</small>
                      </span>
                      <span className="dh-tag">{d.minutes} min</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <article className="dh-feature">
              <div className="dh-feature-art">
                <DocWindow />
              </div>
              <div className="dh-feature-body">
                <span className="kicker">New guide</span>
                <h3>{featured.title}</h3>
                <p>{featured.summary}</p>
                <Link href={docHref(featured.slug)}>
                  Read the guide <Icon name="arrow" className="ic" />
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="dh-sec" aria-label="More help">
          <div className="dh-help">
            {DOC_HELP.map((h) => (
              <div key={h.title}>
                <Icon name={h.icon} className="ic" />
                <h4>{h.title}</h4>
                <p>{h.text}</p>
                {h.href ? <Link href={h.href}>{h.link}</Link> : <span className="dh-soon">Coming soon</span>}
              </div>
            ))}
          </div>
        </section>
      </main>
      <DocsSearch items={docSearchIndex()} />
      <Footer />
    </>
  );
}
