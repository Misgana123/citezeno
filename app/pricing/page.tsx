import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { PlanEstimator } from '@/components/billing/PlanEstimator';
import { PlanPicker } from '@/components/billing/PlanPicker';
import { Icon, type IconName } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { listPricing } from '@/lib/polar';
import { previewPlanViews } from '@/lib/plans';
import './pricing.css';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import { JsonLd } from '@/components/JsonLd';
import { appLd, faqLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Pricing: Starter, Scholar and Lab plans',
  description: 'Citezeno plans from $7 a month. One credit finds real sources for one claim, and powers the research assistant and the paper reader. Billed monthly or annually, 20% less a year.',
  path: '/pricing',
});

// Static and refreshed every 5 minutes, so search engines and visitors get it fast.
// Whether the visitor is signed in is worked out in the browser.
export const revalidate = 300;

const pricing = unstable_cache(listPricing, ['polar-pricing'], { revalidate: 300 });

/* what every plan includes */
const INCLUDED: [IconName, string, string][] = [
  ['quote', '12 citation styles', 'APA, MLA, Chicago, Harvard, IEEE, Vancouver and more, switched instantly.'],
  ['list', '5 output forms', 'In-text, footnotes, endnotes, bibliography or annotated bibliography.'],
  ['word', 'Word and PDF', 'Real .docx footnotes and hanging indents, or a print-ready PDF.'],
  ['code', 'BibTeX, RIS, CSL-JSON', 'Send your references to Zotero, Mendeley or EndNote.'],
  ['shield', 'Check existing citations', 'Find out which references in a draft are real. Never costs credits.'],
  ['upload', 'Import your references', 'Bring in .bib and .ris files from your reference manager.'],
  ['history', 'Synced library', 'Every trace saved to your account, on every device.'],
  ['globe', 'Share links', 'A read-only page for any trace, with an optional password.'],
];

/* what credits pay for, in plain words; the app shows what an action will cost right before it runs */
const BUYS: [IconName, string, string][] = [
  ['spark', 'Answers from the assistant', 'Each answer with its searches and steps. Lighter models use fewer credits.'],
  ['layers', 'Deep research reports', 'A full report with numbered sources. You see the estimate and confirm before it starts.'],
  ['reader', 'Help with papers', 'Summaries, questions and explanations. A summary that already exists is free.'],
  ['upload', 'Your own PDFs, ready to question', 'Each upload is prepared once so you can ask it anything.'],
  ['quote', 'Sources for your claims', 'Tracing a draft in the studio, or “Cite this claim”. The cost is shown before you start.'],
  ['check', 'Free, always', 'Styles, editing, exports, imports, citation checks, share links, reading and highlighting.'],
];

const FAQ = [
  ['What counts as one claim?', `Each sentence Citezeno searches sources for. A full trace uses one credit per claim it picks (the button shows the cost before you start), and “Cite this claim” uses ${CREDITS_PER_CLAIM}.`],
  ['How are AI actions charged?', 'By what they really cost. Before an answer, a summary or a research report starts, its credits are set aside; when it finishes you pay what it actually used and the rest comes straight back. Every answer shows what it cost.'],
  ['What if something fails or I stop it?', 'If an action fails without giving you anything, it costs nothing. If you stop it, you pay only for the steps that already ran.'],
  ['Do credits expire?', 'Yes. Each month’s plan credits end with that month, and the next month’s arrive with your renewal. Top-ups last 12 months. The credits that end soonest are always used first, and we email you a week before a top-up ends.'],
  ['Monthly or annual: what’s the difference?', 'The same plan for 20% less with annual billing. Annual plans still add their credits one month at a time. You can cancel any time from your account page.'],
  ['Is there a free plan?', 'No. Without a plan you can still sign in, read, export and share everything you’ve made, but anything that uses credits needs a plan.'],
  ['Can I get a refund?', 'Contact us and we’ll sort it out. When a payment is refunded, the credits it bought that you haven’t used are removed.'],
];

export default async function PricingPage() {
  const { plans, packs } = await pricing();
  // until Scholar and Lab exist in Polar, show them at their display prices
  const preview = plans.length === 0;
  const shown = preview ? previewPlanViews() : plans;
  const prices = [...plans.flatMap((p) => [p.month, p.year]).filter((x) => x !== undefined), ...packs].map((x) => x!.price);
  const currency = plans[0]?.month?.currency || plans[0]?.year?.currency || packs[0]?.currency;
  return (
    <>
      <JsonLd data={faqLd(FAQ as [string, string][])} />
      <JsonLd
        data={appLd(prices.length && currency ? { lowPrice: Math.min(...prices) / 100, highPrice: Math.max(...prices) / 100, currency } : {})}
      />
      <Nav />
      <main className="pr">
        <header className="pr-hero wrap">
          <span className="kicker">Pricing</span>
          <h1>
            One credit, <em>one price.</em>
          </h1>
          <p>
            One credit balance for every tool, at what each action really costs. Bigger plans add credits, models and room.
          </p>
          <ul className="pr-assure">
            <li><Icon name="check" /> From $7 a month</li>
            <li><Icon name="check" /> 20% less billed yearly</li>
            <li><Icon name="check" /> Cancel any time</li>
          </ul>
        </header>

        <div className="wrap">
          <PlanPicker plans={shown} packs={packs} />
        </div>

        <section className="pr-facts wrap" aria-label="How credits work">
          <div>
            <b>{CREDITS_PER_CLAIM}</b>
            <span>credit per claim</span>
            <p>Searched across every database you switch on. The trace button shows the cost first.</p>
          </div>
          <div>
            <b>$0.01</b>
            <span>a credit, on every plan</span>
            <p>No plan gets cheaper credits; bigger plans get more of them, plus more models and room.</p>
          </div>
          <div>
            <b>1 month</b>
            <span>for plan credits</span>
            <p>Each month’s credits end with the month. Top-ups last 12 months. The soonest to end go first.</p>
          </div>
          <div>
            <b>0</b>
            <span>for a failed action</span>
            <p>If something fails and gives you nothing, it costs nothing. Unused holds come straight back.</p>
          </div>
        </section>

        <section className="pr-incl wrap" aria-labelledby="buys-title">
          <div className="pr-sec-head">
            <span className="kicker">What your credits buy</span>
            <h2 id="buys-title">
              One balance, <em>every tool.</em>
            </h2>
          </div>
          <ul>
            {BUYS.map(([icon, title, body]) => (
              <li key={body}>
                <span className="pr-incl-ico">
                  <Icon name={icon} />
                </span>
                <b>{title}</b>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="wrap">
          <PlanEstimator
            tiers={shown.map((p) => ({ key: p.key, name: p.name, credits: p.monthlyCredits }))}
          />
        </div>

        <section className="pr-incl wrap" aria-labelledby="incl-title">
          <div className="pr-sec-head">
            <span className="kicker">Every plan</span>
            <h2 id="incl-title">
              The essentials, <em>on every plan.</em>
            </h2>
          </div>
          <ul>
            {INCLUDED.map(([icon, title, body]) => (
              <li key={title}>
                <span className="pr-incl-ico">
                  <Icon name={icon} />
                </span>
                <b>{title}</b>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pr-faq wrap" aria-labelledby="faq-title">
          <div className="pr-faq-side">
            <span className="kicker">Questions</span>
            <h2 id="faq-title">
              Good to <em>know.</em>
            </h2>
            <p>
              Anything else? <Link href="/contact">Contact us</Link> and a person will reply.
            </p>
            <p className="pr-polar">
              <Icon name="shield" />
              <span>Payments are handled by Polar, our merchant of record, which also takes care of sales tax and VAT.</span>
            </p>
          </div>
          <div className="pr-faq-list">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span className="pr-faq-ico" aria-hidden="true" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
