import Link from 'next/link';
import { HeroThread } from '@/components/HeroThread';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { Specimens } from '@/components/Specimens';

const DBS = [
  ['OpenAlex', '250M+ scholarly works with abstracts'],
  ['Crossref', 'The DOI registry publishers deposit to'],
  ['Open Library', 'Books, editions and ISBNs'],
  ['Wikipedia', 'Encyclopedia entries, off by default'],
];

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
    eg: <span>Strong match 72%, found in OpenAlex and Crossref</span>,
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
      <Nav onBlue />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <h1 className="display">
                Every <span style={{ whiteSpace: 'nowrap' }}>claim<span className="mark" aria-hidden="true">1</span></span> needs a source that exists.
              </h1>
              <p className="lede">
                Paste text from any AI model. Citezeno finds the sentences that state facts, searches live scholarly
                databases for real published work behind each one, and formats the references in the style you need.
              </p>
              <div className="hero-cta">
                <Link className="btn btn-thread" href="/studio">
                  Trace sources for my draft
                </Link>
                <Link className="btn btn-on-blue" href="#method">
                  See how it works
                </Link>
              </div>
              <ul className="hero-facts">
                <li><Icon name="shield" /> Every reference links to a real record</li>
                <li><Icon name="quote" /> 12 citation styles</li>
                <li><Icon name="word" /> Download as Word or PDF</li>
                <li><Icon name="bolt" /> Runs in your browser, no account</li>
              </ul>
            </div>
            <HeroThread />
          </div>
        </section>

        <section className="dbstrip" aria-label="Databases searched">
          <div className="wrap dbstrip-in">
            <p className="dbstrip-label">Searched live, every time you trace</p>
            {DBS.map(([name, what]) => (
              <div className="dbstrip-item" key={name}>
                <b>{name}</b>
                <span>{what}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="method">
          <div className="wrap">
            <div className="section-head">
              <h2 className="h2">From draft to reference list in four steps.</h2>
              <p>
                Nothing is written from memory. Each step works on records that already exist in a public database, so
                every reference carries a DOI, ISBN or URL you can open.
              </p>
            </div>
            <ol className="method" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {STEPS.map((s, i) => (
                <li className="step" key={s.title}>
                  <div className="step-n">{i + 1}</div>
                  <h3 className="h3">{s.title}</h3>
                  <p>{s.body}</p>
                  <div className="eg">{s.eg}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} id="styles">
          <div className="wrap">
            <div className="section-head">
              <h2 className="h2">Twelve styles from one set of records.</h2>
              <p>
                Choose a style to see the same work typeset its way, with the reference entry and how it is cited in
                the text.
              </p>
            </div>
            <Specimens />
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

        <section className="wrap cta-band">
          <h2 className="h2">Bring a draft. Leave with a reference list you can check.</h2>
          <Link className="btn btn-thread" href="/studio">
            Open the studio
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
