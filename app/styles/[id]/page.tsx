import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { JsonLd } from '@/components/JsonLd';
import { Footer, Nav } from '@/components/Nav';
import { FREE_MONTHLY_CREDITS } from '@/lib/pricing';
import { STYLE_GUIDES } from '@/lib/style-guides';
import { SPECIMENS, STYLES, STYLE_GROUPS, specimen } from '@/lib/styles';
import { breadcrumbLd, faqLd, howToLd, pageMeta } from '@/lib/seo';

/* One landing page per citation style, built at deploy time. The examples come
   from the same engine the studio uses, so they are always in sync. */

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(STYLE_GUIDES).map((id) => ({ id }));
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const g = STYLE_GUIDES[id];
  if (!g) return {};
  return pageMeta({
    title: `${g.label} citation generator, with examples`,
    description: `Free ${g.label} citation generator that finds real sources for your claims. ${g.label} reference and in-text examples for journal articles, books and websites, plus the key rules.`,
    path: `/styles/${id}`,
    ogType: 'article',
    image: `/styles/${id}/opengraph-image`,
  });
}

const KINDS: [keyof typeof SPECIMENS, string][] = [
  ['article', 'Journal article'],
  ['book', 'Book'],
  ['web', 'Web page'],
];

export default async function StylePage({ params }: Props) {
  const { id } = await params;
  const g = STYLE_GUIDES[id];
  const st = STYLES[id];
  if (!g || !st) notFound();

  const examples = KINDS.map(([k, label]) => ({ label, ...specimen(id, SPECIMENS[k]) }));
  const family = STYLE_GROUPS.find(([, ids]) => ids.includes(id))!;
  const related = family[1].filter((x) => x !== id && STYLE_GUIDES[x]);
  const others = Object.keys(STYLE_GUIDES).filter((x) => x !== id && !related.includes(x));
  const faq: [string, string][] = [
    ...g.faq,
    [
      `Can Citezeno find real sources and format them in ${g.label}?`,
      `Yes. Paste your draft, choose ${st.name}, and Citezeno searches OpenAlex, Crossref, Open Library and Wikipedia for published works behind each claim, then formats every reference in ${g.label}. You get ${FREE_MONTHLY_CREDITS} free credits a month.`,
    ],
  ];

  return (
    <>
      <JsonLd data={breadcrumbLd([['Home', '/'], ['Citation styles', '/styles'], [g.label, `/styles/${id}`]])} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={howToLd({
          name: `How to cite sources in ${g.label} with Citezeno`,
          description: `Find real sources for the claims in a draft and format them in ${g.label}.`,
          steps: [
            ['Paste your draft', 'Paste text you wrote or got from an AI model into the Citezeno studio.'],
            [`Choose ${st.name}`, `Pick ${g.label} from the list of citation styles.`],
            ['Trace the claims', 'Citezeno finds real published works for each factual claim in OpenAlex, Crossref, Open Library and Wikipedia.'],
            ['Check and export', 'Open each source to confirm it supports your sentence, then download Word, PDF or BibTeX.'],
          ],
        })}
      />
      <Nav />
      <main className="wrap page sg">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/styles">Citation styles</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{g.label}</span>
        </nav>

        <header className="sg-head">
          <h1 className="h2">{g.label} citation generator</h1>
          <p className="lede">
            {g.summary} Citezeno finds real, verifiable sources for your claims and formats them in {g.label} automatically.
          </p>
          <div className="hero-cta" style={{ marginTop: 26 }}>
            <Link className="btn btn-thread" href="/sign-up">
              Cite my draft in {st.name}, free
            </Link>
            <Link className="btn btn-ghost" href="/styles">
              Compare all 12 styles
            </Link>
          </div>
          <p className="small" style={{ marginTop: 14 }}>
            {g.full}. Used in {g.usedIn}.
          </p>
        </header>

        <section className="sg-sec">
          <h2 className="h3">{g.label} examples</h2>
          <p className="sg-p">How a journal article, a book and a web page look in {g.label}, both in the reference list and in your text.</p>
          <div className="sg-examples">
            {examples.map((ex) => (
              <article key={ex.label} className="gcard">
                <header>
                  <b>{ex.label}</b>
                </header>
                <p className="gcard-ref" dangerouslySetInnerHTML={{ __html: ex.entry }} />
                <p className="gcard-in">
                  <span>{ex.inTextLabel}</span>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: st.marker === 'sup' && st.family === 'numeric' ? `claim<sup>${ex.inText}</sup>` : ex.inText,
                    }}
                  />
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="sg-grid">
          <div className="sg-sec">
            <h2 className="h3">In-text citations in {g.label}</h2>
            <p className="sg-p">{g.inText}</p>
            <h2 className="h3" style={{ marginTop: 32 }}>
              Key {g.label} rules
            </h2>
            <ul className="sg-rules">
              {g.rules.map((r) => (
                <li key={r}>
                  <Icon name="check" /> {r}
                </li>
              ))}
            </ul>
          </div>
          <aside className="sg-cta">
            <h2 className="h3">Stop checking whether citations are real</h2>
            <p>
              AI chatbots often invent references that look right but don’t exist. Citezeno only formats records returned by
              real databases, so every {st.name} reference links to a work you can open.
            </p>
            <ol>
              <li>Paste your draft</li>
              <li>Choose {st.name}</li>
              <li>Get real sources for each claim</li>
              <li>Download Word, PDF or BibTeX</li>
            </ol>
            <Link className="btn btn-thread" href="/sign-up" style={{ width: '100%' }}>
              Try it free
            </Link>
          </aside>
        </section>

        <section className="faq" style={{ marginTop: 64 }}>
          <h2 className="h3" style={{ fontSize: 26 }}>
            {g.label} questions
          </h2>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="sg-sec" style={{ marginTop: 64 }}>
          <h2 className="h3">Other citation styles</h2>
          <ul className="sg-links">
            {[...related, ...others].map((x) => (
              <li key={x}>
                <Link href={`/styles/${x}`}>{STYLE_GUIDES[x].label} generator</Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
