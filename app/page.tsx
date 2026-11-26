import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { JsonLd } from '@/components/JsonLd';
import { InView } from '@/components/landing/InView';
import { DeepRun } from '@/components/landing/DeepRun';
import { PlanReceipt, type ReceiptPlan } from '@/components/landing/PlanReceipt';
import { receiptLines } from '@/lib/plan-lines';
import { previewPlanViews } from '@/lib/plans';
import { SITE, appLd, faqLd, organizationLd, pageMeta, websiteLd } from '@/lib/seo';
import './landing.css';

export const metadata = pageMeta({
  title: 'Citezeno: the AI research assistant that cites real sources',
  description: SITE.description,
  path: '/',
});

const FAQ: [string, string][] = [
  [
    'What is Citezeno?',
    'An AI research platform. A research assistant that answers with real sources, deep research reports, a search across 250 million scholarly works, a reader that lets you ask questions of any PDF, a shelf for the papers you keep, and a citation studio for 12 styles.',
  ],
  [
    'Does the assistant make up sources?',
    'It cites the papers its searches return, the web pages it opened and the PDFs you gave it, and every citation links out so you can check it. It can still misread a source, so open the ones you rely on before you submit.',
  ],
  [
    'What is deep research?',
    'A longer run for bigger questions. It splits your question into sub-questions, searches papers and the web for each, looks for what is still missing, and writes a structured report with numbered sources. It takes a few minutes, you see every step, and you confirm the credit estimate before it starts.',
  ],
  [
    'Which AI models does it use?',
    'Models from Google, Anthropic, OpenAI and others. Economy and Standard models come with every plan, Premium models with Lab, and you can switch model in any chat.',
  ],
  [
    'Can I upload my own PDFs?',
    'Yes. Add a PDF to your shelf, open it in the reader and ask it questions; each answer points to the passage and page it came from. You can also attach PDFs to a chat.',
  ],
  [
    'Which citation styles are supported?',
    'Twelve: APA 7, MLA 9, Chicago 17 (notes and author–date), Turabian 9, Harvard, ASA 7, IEEE, Vancouver, AMA 11, ACS and CSE 9, with Word, PDF, BibTeX, RIS and CSL-JSON exports.',
  ],
  [
    'How much does Citezeno cost?',
    'Plans start at $7 a month (20% less billed yearly). One credit balance pays for the assistant, deep research, the reader and the citation studio. Exports, share links and reading never cost credits.',
  ],
];

/* the three sources shown in the hero's chat window (real works) */
const HERO_REFS = [
  { via: 'Paper · OpenAlex', color: 'var(--c-openalex)', ok: 'DOI resolves', who: 'Oke, T. R. (1982).', title: 'The energetic basis of the urban heat island.', where: 'Quarterly Journal of the Royal Meteorological Society, 108', tail: '(455), 1–24.', match: 84 },
  { via: 'Paper · OpenAlex', color: 'var(--c-openalex)', ok: 'DOI resolves', who: 'Bowler, D. E., et al. (2010).', title: 'Urban greening to cool towns and cities.', where: 'Landscape and Urban Planning, 97', tail: '(3), 147–155.', match: 76 },
  { via: 'Paper · OpenAlex', color: 'var(--c-openalex)', ok: 'Not retracted', who: 'Akbari, H., et al. (2009).', title: 'Global cooling: increasing world-wide urban albedos.', where: 'Climatic Change, 94', tail: ', 275–286.', match: 61 },
];

/* "Searched live": the kinds of source, and real records they return */
const DBS = [
  { name: 'OpenAlex', what: '250M+ scholarly works with abstracts', color: 'var(--c-openalex)' },
  { name: 'Crossref', what: 'The DOI registry publishers deposit to', color: 'var(--c-crossref)' },
  { name: 'Open Library', what: 'Books, editions and ISBNs', color: 'var(--c-openlibrary)' },
  { name: 'Wikipedia', what: 'Encyclopedia entries, off by default', color: 'var(--c-wikipedia)' },
  { name: 'The open web', what: 'Live pages, cited by URL', color: 'var(--c-web)' },
  { name: 'Your PDFs', what: 'Uploads you can question page by page', color: 'var(--c-uploads)' },
];
const RECORDS = [
  { db: 'OpenAlex', title: 'The energetic basis of the urban heat island', id: '10.1002/qj.49710845502' },
  { db: 'Web', title: 'Using trees and vegetation to reduce heat islands', id: 'epa.gov' },
  { db: 'Crossref', title: 'Deep learning', id: '10.1038/nature14539' },
  { db: 'Your PDF', title: 'Field notes, site B.pdf', id: 'p. 4' },
  { db: 'Open Library', title: 'The Structure of Scientific Revolutions', id: 'ISBN 978-0226458083' },
  { db: 'Crossref', title: 'Urban greening to cool towns and cities', id: '10.1016/j.landurbplan.2010.05.006' },
  { db: 'OpenAlex', title: 'Attention is all you need', id: '10.48550/arXiv.1706.03762' },
];
const DB_COLOR: Record<string, string> = { OpenAlex: 'var(--c-openalex)', Crossref: 'var(--c-crossref)', 'Open Library': 'var(--c-openlibrary)', Web: 'var(--c-web)', 'Your PDF': 'var(--c-uploads)' };

const STEPS = [
  {
    title: 'Ask',
    body: 'Type a question, or drop in a draft or a PDF. Choose a quick answer or a deep research report.',
    eg: <span className="serif">Do street trees actually cool cities, and by how much?</span>,
  },
  {
    title: 'Research',
    body: 'The assistant plans its searches and runs them live across scholarly databases, the web and your shelf.',
    eg: (
      <>
        <span className="qchip">urban tree canopy</span>
        <span className="qchip">air temperature</span>
        <span className="qchip">meta-analysis</span>
      </>
    ),
  },
  {
    title: 'Read',
    body: 'It reads what it found: the full text when it has it, from your PDFs and open-access papers, and the abstract when it doesn’t.',
    eg: (
      <span className="eg-match">
        <span className="eg-row"><span>Bowler et al., 2010</span><b>Full text</b></span>
        <span className="eg-bar"><i style={{ width: '100%' }} /></span>
        <span className="eg-row"><span>Oke, 1982</span><span>Abstract</span></span>
      </span>
    ),
  },
  {
    title: 'Write & cite',
    body: 'You get an answer with every claim linked to its source. Save the papers to your shelf, or format them in any of 12 styles.',
    eg: <span className="serif">…lower air temperature by about 1 °C <span className="lp-cite">2</span></span>,
  },
];

const BUILT_FOR = [
  {
    who: 'Students',
    sub: 'Essays and coursework with sources that hold up.',
    uses: ['Find real sources for every claim in a draft', 'Ask a set reading what it actually argues', 'Reference lists in APA, MLA or Harvard'],
    ask: 'What are the main criticisms of Maslow’s hierarchy?',
  },
  {
    who: 'Researchers',
    sub: 'A first pass at the literature in minutes.',
    uses: ['Deep research across papers and the web', 'Questions answered from the paper, page by page', 'Export to Zotero, Mendeley or EndNote'],
    ask: 'Summarise randomised trials on intermittent fasting since 2020.',
  },
  {
    who: 'Labs',
    sub: 'Big projects and the strongest models.',
    uses: ['Projects and folders for every paper and thesis', 'Run Python on your own data files', 'Share any chat with a single link'],
    ask: 'Compare these 5 PDFs on sample size and method.',
  },
];

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/* the receipt's plans: names, prices and credits from lib/plans.ts */
const RECEIPT: ReceiptPlan[] = previewPlanViews().map((p) => ({
  key: p.key,
  name: p.name,
  blurb: p.blurb,
  featured: p.featured,
  month: money(p.month!.price),
  year: money(p.year!.price),
  lines: receiptLines(p.key, p.monthlyCredits),
}));

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
              Research with sources <em>that exist.</em>
              <sup aria-hidden="true">[1]</sup>
            </h1>
            <p className="lede rise">
              Ask a question. Citezeno’s research assistant searches 250 million scholarly works and the open web, reads your PDFs, and answers with every claim linked to a
              source you can open. Then save it, read it and cite it, in one place.
            </p>
            <div className="hero-cta rise">
              <Link className="btn btn-thread" href="/app/chat">
                Start researching <Icon name="arrow" />
              </Link>
              <Link className="btn btn-on-blue" href="#method">
                See how it works
              </Link>
            </div>
            <ul className="hero-facts rise">
              <li><Icon name="shield" /> Every claim links to a real source</li>
              <li><Icon name="layers" /> Deep research reports</li>
              <li><Icon name="reader" /> Ask questions of any PDF</li>
              <li><Icon name="quote" /> Cite in 12 styles</li>
            </ul>

            {/* the assistant itself: a question, its searches, and a cited answer */}
            <div className="hero-stage" aria-hidden="true">
              <div className="hero-glow" />
              <div className="hero-window">
                <div className="hero-bar">
                  <i /><i /><i />
                  <span>citezeno.com/app/chat</span>
                </div>
                <div className="lp-hero-chat">
                  <div className="lp-hero-main">
                    <div className="lp-q">Do street trees actually cool cities, and by how much?</div>
                    <div className="lp-steps">
                      <span className="lp-step"><Icon name="check" /> Searched papers · 15 found</span>
                      <span className="lp-step"><Icon name="check" /> Read 2 papers</span>
                      <span className="lp-step"><Icon name="check" /> Searched the web · 5 pages</span>
                    </div>
                    <div className="lp-answer">
                      <p>
                        Yes, measurably. <mark>Cities run several degrees warmer than the countryside around them</mark>
                        <span className="lp-cite is-hot">1</span>, and tree canopy is one of the most reliable ways to pull that back.
                      </p>
                      <p>
                        A review of field studies found <mark>parks were about 1 °C cooler than built-up areas during the day</mark>
                        <span className="lp-cite">2</span>, and lighter roofs and pavements add to the effect<span className="lp-cite">3</span>…
                      </p>
                    </div>
                    <div className="lp-input">
                      <span className="lp-chip"><Icon name="globe" /> Web</span>
                      <span className="lp-chip"><Icon name="layers" /> Deep research</span>
                      Ask a follow-up…
                      <span className="lp-send"><Icon name="send" /></span>
                    </div>
                  </div>
                  <div className="lp-hero-side">
                    <span className="hero-k">Sources · 3</span>
                    {HERO_REFS.map((r, i) => (
                      <div className="hero-ref" key={r.who}>
                        <div className="hero-ref-top">
                          <span className="lp-kind"><i style={{ background: r.color }} />{i + 1} · {r.via}</span>
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
              <p className="kicker">Searched live, every time you ask</p>
              <h2 className="rivers-title" id="rivers-title">
                Papers, books and the web. <em>Nothing from memory.</em>
              </h2>
            </div>
            <dl className="rivers-stats">
              <div><dt>250M+</dt><dd>scholarly works</dd></div>
              <div><dt>6</dt><dd>kinds of source</dd></div>
              <div><dt>0</dt><dd>references from memory</dd></div>
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
                    <span className="river-db" style={{ background: DB_COLOR[r.db] }}>{r.db}</span>
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
                  From question to cited answer <em className="h2-em">in four steps.</em>
                </h2>
              </div>
              <p>
                The assistant doesn’t cite from memory. Every step works on records it can show you, so each claim carries a DOI, ISBN or URL you can open.
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
              <b>Every claim</b> links to a DOI, ISBN or URL you can open.
            </p>
          </div>
        </section>

        <section className="section" id="deep" style={{ paddingTop: 0 }} aria-labelledby="deep-title">
          <div className="lp-dr">
            <div className="wrap lp-dr-in">
              <div>
                <span className="kicker">Deep research</span>
                <h2 id="deep-title">
                  Hours of searching, <em>done while you wait.</em>
                </h2>
                <p className="lp-dr-lede">
                  Give it a bigger question. It splits it into sub-questions, searches papers and the web for each, looks for what’s still missing, and writes a structured
                  report with numbered sources. You watch every step as it happens.
                </p>
                <Link className="btn btn-thread" href="/app/chat">
                  Run a deep research <Icon name="arrow" />
                </Link>
                <dl className="lp-dr-facts">
                  <div><dt>3–5</dt><dd>sub-questions, researched in parallel</dd></div>
                  <div><dt>30</dt><dd>sources a report, at most</dd></div>
                  <div><dt>&lt;5<small> min</small></dt><dd>from question to report</dd></div>
                </dl>
              </div>
              <DeepRun />
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="for-title">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="kicker">Built for</span>
                <h2 className="h2" id="for-title">
                  Whoever is doing <em className="h2-em">the reading.</em>
                </h2>
              </div>
              <p>From a first essay to a thesis, the same tools grow with the work.</p>
            </div>
            <div className="lp-for">
              {BUILT_FOR.map((b) => (
                <div key={b.who}>
                  <h3>{b.who}</h3>
                  <p className="lp-for-sub">{b.sub}</p>
                  <ul>
                    {b.uses.map((u) => (
                      <li key={u}><Icon name="check" />{u}</li>
                    ))}
                  </ul>
                  <div className="lp-try">
                    <span className="lp-k">Try asking</span>“{b.ask}”
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="pricing" style={{ paddingTop: 0 }} aria-labelledby="pricing-title">
          <div className="wrap">
            <PlanReceipt
              plans={RECEIPT}
              intro={
                <>
                  <span className="kicker">Pricing</span>
                  <h2 className="h2" id="pricing-title">
                    Pay for research, <em className="h2-em">not for seats.</em>
                  </h2>
                  <p className="lp-price-lede">
                    One credit balance pays for the assistant, deep research, the reader and the citation studio. Pick the size that fits how much you read.
                  </p>
                </>
              }
              more={
                <Link className="lp-price-more" href="/pricing">
                  Compare every plan and what credits buy <Icon name="arrow" />
                </Link>
              }
            />
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
                Bring a question. Leave with an answer <em>you can check.</em>
              </h2>
              <ul className="cta-drop-points">
                <li><Icon name="check" /> Every claim links to a real source</li>
                <li><Icon name="check" /> Deep research, reader, shelf and 12 citation styles</li>
                <li><Icon name="check" /> Plans from $7 a month</li>
              </ul>
            </div>
            <Link className="lp-askbox" href="/app/chat">
              <span className="lp-k">Ask your first question</span>
              <span className="lp-askbox-in">
                What does the evidence say about four-day work weeks<span className="lp-caret" aria-hidden="true" />
              </span>
              <span className="lp-askbox-row">
                <span className="lp-pill is-on"><Icon name="globe" /> Web</span>
                <span className="lp-pill"><Icon name="layers" /> Deep research</span>
                <span className="lp-pill"><Icon name="clip" /> PDF</span>
                <span className="btn btn-thread">
                  Start researching <Icon name="arrow" />
                </span>
              </span>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
