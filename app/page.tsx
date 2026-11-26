import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { JsonLd } from '@/components/JsonLd';
import { InView } from '@/components/landing/InView';
import { StyleWall } from '@/components/landing/StyleWall';
import { STYLE_GUIDES } from '@/lib/style-guides';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import { SITE, appLd, faqLd, organizationLd, pageMeta, websiteLd } from '@/lib/seo';

export const metadata = pageMeta({
  title: 'Citezeno: find real sources and citations for AI-generated text',
  description: SITE.description,
  path: '/',
});

const FAQ: [string, string][] = [
  [
    'Does ChatGPT make up citations?',
    'Often, yes. Large language models can write references that look correct but point to papers that don’t exist. Citezeno avoids this by only formatting records that it finds in real databases, so every reference links to a work you can open.',
  ],
  [
    'How does Citezeno find sources?',
    'It splits your draft into sentences, picks the ones that make factual claims, and searches OpenAlex, Crossref, Open Library and (optionally) Wikipedia for published works on the same topic. Matches are ranked by how closely their title, abstract and keywords fit the claim.',
  ],
  [
    'Which citation styles are supported?',
    'Twelve: APA 7, MLA 9, Chicago 17 (notes and author–date), Turabian 9, Harvard, ASA 7, IEEE, Vancouver, AMA 11, ACS and CSE 9, as in-text citations, footnotes, endnotes, a bibliography or an annotated bibliography.',
  ],
  [
    'How much does Citezeno cost?',
    'Plans start at $7 a month (20% less billed yearly). One credit finds sources for one claim, and the same credits pay for the research assistant and the paper reader. Checking existing citations, exports and share links never cost credits.',
  ],
  [
    'Can I download the result as a Word document?',
    'Yes. Download a real .docx with proper footnotes and a hanging-indent reference list, a print-ready PDF, or BibTeX, RIS and CSL-JSON for Zotero, Mendeley and EndNote.',
  ],
  [
    'Do I still need to check the sources?',
    'Yes. Citezeno matches sources by topic and can’t read every paper in full. Open each one and confirm it supports your sentence before you submit. Works that have been retracted are skipped automatically.',
  ],
];

/* the three records shown in the hero's studio window (real works) */
const HERO_REFS = [
  { via: 'OpenAlex · Crossref', ok: 'DOI resolves', who: 'Oke, T. R. (1982).', title: 'The energetic basis of the urban heat island.', where: 'Quarterly Journal of the Royal Meteorological Society, 108', tail: '(455), 1–24.', match: 82 },
  { via: 'Crossref', ok: 'DOI resolves', who: 'Bowler, D. E., et al. (2010).', title: 'Urban greening to cool towns and cities.', where: 'Landscape and Urban Planning, 97', tail: '(3), 147–155.', match: 71 },
  { via: 'OpenAlex', ok: 'Not retracted', who: 'Akbari, H., et al. (2009).', title: 'Global cooling: increasing world-wide urban albedos.', where: 'Climatic Change, 94', tail: ', 275–286.', match: 64 },
];

/* "Searched live": the databases, and real records they return */
const DBS = [
  { name: 'OpenAlex', what: '250M+ scholarly works with abstracts', color: 'var(--c-openalex)' },
  { name: 'Crossref', what: 'The DOI registry publishers deposit to', color: 'var(--c-crossref)' },
  { name: 'Open Library', what: 'Books, editions and ISBNs', color: 'var(--c-openlibrary)' },
  { name: 'Wikipedia', what: 'Encyclopedia entries, off by default', color: 'var(--c-wikipedia)' },
];
const RECORDS = [
  { db: 'OpenAlex', title: 'The energetic basis of the urban heat island', id: '10.1002/qj.49710845502' },
  { db: 'Crossref', title: 'Deep learning', id: '10.1038/nature14539' },
  { db: 'Open Library', title: 'The Structure of Scientific Revolutions', id: 'ISBN 978-0226458083' },
  { db: 'Crossref', title: 'Urban greening to cool towns and cities', id: '10.1016/j.landurbplan.2010.05.006' },
  { db: 'Wikipedia', title: 'Urban heat island', id: 'en.wikipedia.org' },
  { db: 'OpenAlex', title: 'Attention is all you need', id: '10.48550/arXiv.1706.03762' },
];
/* the generator index: a short name where two styles share one, and the field each serves */
const GEN_NAME: Record<string, string> = { chicagoad: 'Chicago (author–date)', chicago: 'Chicago (notes)' };
const GEN_FIELD: Record<string, string> = {
  apa: 'Social sciences', mla: 'Humanities', harvard: 'Many fields', chicagoad: 'Social sciences', asa: 'Sociology',
  ieee: 'Engineering', vancouver: 'Medicine', ama: 'Medicine', acs: 'Chemistry', cse: 'Biology', chicago: 'History', turabian: 'History',
};
const dbColor = (name: string) => DBS.find((d) => d.name === name)!.color;

const STEPS = [
  {
    title: 'Read',
    body: 'Your draft is split into sentences. Statistics, findings and history rank high; opinions, questions and conclusions rank low.',
    eg: (
      <span className="serif">
        <mark>Cities are several degrees warmer than the countryside around them.</mark> That matters.
      </span>
    ),
  },
  {
    title: 'Search',
    body: 'The strongest phrases in each claim become a query, sent live from your browser to every database you switch on.',
    eg: (
      <>
        <span className="qchip">urban heat island</span>
        <span className="qchip">surrounding countryside</span>
        <span className="qchip">warmer cities</span>
      </>
    ),
  },
  {
    title: 'Rank',
    body: 'Each result is scored on how much its title, abstract and keywords overlap the claim. Duplicates across databases merge into one record.',
    eg: (
      <span className="eg-match">
        <span className="eg-row">
          <span>Strong match</span>
          <b>72%</b>
        </span>
        <span className="eg-bar">
          <i style={{ width: '72%' }} />
        </span>
        <span className="eg-row">
          <span>OpenAlex + Crossref</span>
          <span>1 record</span>
        </span>
      </span>
    ),
  },
  {
    title: 'Format',
    body: 'Pick any of 12 styles and 5 output forms, then download a Word or PDF file. Switching style re-typesets instantly, with no new search.',
    eg: <span className="serif">Oke, T. R. (1982). The energetic basis of the urban heat island…</span>,
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={websiteLd()} />
      <JsonLd data={appLd()} />
      <JsonLd data={faqLd(FAQ)} />
      <Nav onBlue />
      <main>
        <section className="hero">
          <div className="wrap hero-in">
            <h1 className="rise">
              Every claim needs a source <em>that exists.</em>
              <sup aria-hidden="true">[1]</sup>
            </h1>
            <p className="lede rise">
              Paste text from any AI model. Citezeno finds the sentences that state facts, searches live scholarly
              databases for real published work behind each one, and formats the references in the style you need.
            </p>
            <div className="hero-cta rise">
              <Link className="btn btn-thread" href="/app/citation">
                Trace sources for my draft <Icon name="arrow" />
              </Link>
              <Link className="btn btn-on-blue" href="#method">
                See how it works
              </Link>
            </div>
            <ul className="hero-facts rise">
              <li><Icon name="shield" /> Every reference links to a real record</li>
              <li><Icon name="quote" /> 12 citation styles</li>
              <li><Icon name="word" /> Word, PDF, BibTeX</li>
              <li><Icon name="bolt" /> Free credits every month</li>
            </ul>

            {/* the studio itself: a draft whose claims are matched to real records */}
            <div className="hero-stage" aria-hidden="true">
              <div className="hero-glow" />
              <div className="hero-window">
                <div className="hero-bar">
                  <i /><i /><i />
                  <span>citezeno.com/studio</span>
                </div>
                <div className="hero-body">
                  <div className="hero-draft">
                    <span className="hero-k">Your draft · APA 7</span>
                    <mark>Cities are several degrees warmer than the countryside around them</mark> (Oke, 1982). Planners
                    have responded with street trees and reflective roofs. <mark>Urban greening lowers surface temperatures
                    by up to a few degrees</mark> (Bowler et al., 2010), and <mark className="open">cool roofs cut indoor
                    cooling demand in hot climates</mark>
                    <sup>…</sup>
                  </div>
                  <div className="hero-refs">
                    <span className="hero-k">Real records found</span>
                    {HERO_REFS.map((r) => (
                      <div className="hero-ref" key={r.who}>
                        <div className="hero-ref-top">
                          {r.via}
                          <span className="hero-ref-ok">
                            <Icon name="check" /> {r.ok}
                          </span>
                        </div>
                        <p>
                          {r.who} {r.title} <i>{r.where}</i>
                          {r.tail}
                        </p>
                        <div className="hero-ref-m">
                          <i style={{ width: `${r.match}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rivers" aria-labelledby="rivers-title">
          <div className="wrap rivers-head">
            <div>
              <p className="kicker">Searched live, every time you trace</p>
              <h2 className="rivers-title" id="rivers-title">
                Four public databases. <em>Zero invented references.</em>
              </h2>
            </div>
            <dl className="rivers-stats">
              <div><dt>250M+</dt><dd>scholarly works</dd></div>
              <div><dt>4</dt><dd>databases</dd></div>
              <div><dt>0</dt><dd>written from memory</dd></div>
            </dl>
          </div>
          {/* each row is drawn twice so the scroll loops without a seam; the copy is hidden from screen readers */}
          <div className="marquee rivers-names">
            {[0, 1].map((copy) => (
              <ul className="marquee-track" key={copy} aria-hidden={copy ? true : undefined}>
                {DBS.map((d) => (
                  <li className="river-name" key={d.name}>
                    <i style={{ background: d.color }} />
                    <b>{d.name}</b>
                    <span>{d.what}</span>
                    <span className="river-sep" aria-hidden="true">✦</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <div className="marquee is-reverse rivers-records" aria-hidden="true">
            {[0, 1].map((copy) => (
              <ul className="marquee-track" key={copy}>
                {RECORDS.map((r) => (
                  <li className="river-rec" key={r.id}>
                    <span className="river-db" style={{ background: dbColor(r.db) }}>{r.db}</span>
                    <em>{r.title}</em>
                    <code>{r.id}</code>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        <section className="section" id="method">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="kicker">How it works</span>
                <h2 className="h2">
                  From draft to reference list <em className="h2-em">in four steps.</em>
                </h2>
              </div>
              <p>
                Nothing is written from memory. Each step works on records that already exist in a public database, so
                every reference carries a DOI, ISBN or URL you can open.
              </p>
            </div>
            <InView as="ol" className="thread">
              {STEPS.map((s, i) => (
                <li className="thread-step" key={s.title}>
                  <span className="thread-node" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="thread-card">
                    <h3 className="h3">{s.title}</h3>
                    <p>{s.body}</p>
                    <div className="thread-eg">{s.eg}</div>
                  </div>
                </li>
              ))}
            </InView>
            <p className="thread-foot">
              <b>Every reference</b> links to a DOI, ISBN or URL you can open.
            </p>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} id="styles">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="kicker">Citation styles</span>
                <h2 className="h2">
                  Twelve styles from <em className="h2-em">one set of records.</em>
                </h2>
              </div>
              <p>One record, typeset twelve ways. Each card shows the reference entry and how it’s cited in the text.</p>
            </div>
            <StyleWall />
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="honest">
              <div>
                <h2 className="h2">AI models invent citations. Citezeno can’t.</h2>
                <p>
                  A chatbot can write a reference that looks perfect and points to nothing. Citezeno only formats
                  records returned by a database, so every entry resolves.
                </p>
                <p>
                  It matches by topic, not by reading each paper in full. Open every source and confirm it says what
                  your sentence says before you submit.
                </p>
              </div>
              <div className="compare">
                <div className="compare-row bad">
                  <small><Icon name="x" /> Written by a chatbot, does not exist</small>
                  <span className="ref">
                    Hartley, M., &amp; Osei, K. (2019). Neural diagnosis in modern clinical dermatology. <i>Journal of
                    Applied Medical Intelligence, 14</i>(2), 88–104.
                  </span>
                </div>
                <div className="compare-row good">
                  <small><Icon name="check" /> Found by Citezeno in OpenAlex and Crossref</small>
                  <span>
                    Esteva, A., Kuprel, B., Novoa, R. A., Ko, J., Swetter, S. M., Blau, H. M., &amp; Thrun, S. (2017).
                    Dermatologist-level classification of skin cancer with deep neural networks. <i>Nature, 542</i>(7639),
                    115–118. https://doi.org/10.1038/nature21056
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="popular">
          <div className="wrap">
            <div className="gindex-head">
              <span className="kicker">Free generators</span>
              <h2 className="h2" id="popular">
                Citation generators <em className="h2-em">by style.</em>
              </h2>
              <p>Rules, examples and a generator for each of the twelve styles Citezeno supports.</p>
            </div>
            <div className="gindex">
              {STYLE_GROUPS.map(([group, ids]) => (
                <div className="gindex-col" key={group}>
                  <h3>
                    {group}
                    <span>{ids.length}</span>
                  </h3>
                  <ul>
                    {ids.filter((id) => STYLE_GUIDES[id]).map((id) => (
                      <li key={id}>
                        <Link href={`/styles/${id}`} title={`${STYLE_GUIDES[id].label} generator and guide`}>
                          <b>{GEN_NAME[id] || STYLES[id].name}</b>
                          <span className="gindex-dots" aria-hidden="true" />
                          <small>{GEN_FIELD[id]}</small>
                          <Icon name="arrow" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="faq">
          <div className="wrap faq" style={{ marginTop: 0 }}>
            <h2 className="h2" id="faq" style={{ textAlign: 'center', marginBottom: 28 }}>
              Questions, answered
            </h2>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="wrap cta-drop-wrap" aria-labelledby="cta-title">
          <div className="cta-drop-card">
            <div>
              <h2 className="cta-drop-title" id="cta-title">
                Bring a draft. Leave with a reference list <em>you can check.</em>
              </h2>
              <ul className="cta-drop-points">
                <li><Icon name="check" /> Every reference links to a real record</li>
                <li><Icon name="check" /> 12 styles, Word and PDF downloads</li>
                <li><Icon name="check" /> Plans from $7 a month</li>
              </ul>
            </div>
            <Link className="cta-drop" href="/app/citation">
              <span className="cta-drop-ico">
                <Icon name="upload" />
              </span>
              <b>Paste or drop your draft</b>
              <small>.docx, .txt or .md, or any text from an AI model</small>
              <span className="btn cta-drop-btn">
                Open the studio <Icon name="arrow" />
              </span>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
