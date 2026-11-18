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
import { CREDITS_PER_CLAIM, FREE_MONTHLY_CREDITS } from '@/lib/pricing';
import { JsonLd } from '@/components/JsonLd';
import { appLd, faqLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Pricing: free monthly credits, pay only for what you cite',
  description: `Citezeno is free to start with ${FREE_MONTHLY_CREDITS} credits every month. One credit finds real sources for one claim. Scholar and Lab plans add more, billed monthly or annually, and unused credits never expire.`,
  path: '/pricing',
});

// Static and refreshed every 5 minutes, so search engines and visitors get it fast.
// Whether the visitor is signed in is worked out in the browser.
export const revalidate = 300;

const pricing = unstable_cache(listPricing, ['polar-pricing'], { revalidate: 300 });

/* what every plan includes, free or paid */
const INCLUDED: [IconName, string, string][] = [
  ['quote', '12 citation styles', 'APA, MLA, Chicago, Harvard, IEEE, Vancouver and more, switched instantly.'],
  ['list', '5 output forms', 'In-text, footnotes, endnotes, bibliography or annotated bibliography.'],
  ['word', 'Word and PDF', 'Real .docx footnotes and hanging indents, or a print-ready PDF.'],
  ['code', 'BibTeX, RIS, CSL-JSON', 'Send your references to Zotero, Mendeley or EndNote.'],
  ['shield', 'Check existing citations', 'Find out which references in a draft are real. Always free.'],
  ['upload', 'Import your references', 'Bring in .bib and .ris files from your reference manager.'],
  ['history', 'Synced library', 'Every trace saved to your account, on every device.'],
  ['globe', 'Share links', 'A read-only page for any trace, with an optional password.'],
];

const FAQ = [
  ['What counts as one claim?', `Each sentence Citezeno searches sources for. A full trace uses one credit per claim it picks (the button shows the cost before you start), and “Cite this claim” uses ${CREDITS_PER_CLAIM}.`],
  ['What if a trace fails or I stop it?', 'If a trace stops before it finishes (you press Stop, or the databases can’t be reached), its credits are returned automatically.'],
  ['Do credits expire?', `Purchased credits never expire. The ${FREE_MONTHLY_CREDITS} free credits refill on the first of each month and don’t roll over. Free credits are always used first.`],
  ['Monthly or annual: what’s the difference?', 'The same plan, billed differently. Annual billing costs less and adds the whole year’s credits as soon as you pay. Either way, unused credits roll over and never expire, and you can cancel any time from your account page.'],
  ['Does anything else cost credits?', 'No. Switching styles, editing, replacing sources, exporting to Word or PDF and reopening saved traces are all free.'],
  ['Can I get a refund?', 'Contact us and we’ll sort it out. When a payment is refunded, the credits it bought are removed from your balance.'],
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
        data={appLd({
          freeCredits: FREE_MONTHLY_CREDITS,
          ...(prices.length && currency ? { lowPrice: 0, highPrice: Math.max(...prices) / 100, currency } : {}),
        })}
      />
      <Nav />
      <main className="pr">
        <header className="pr-hero wrap">
          <span className="kicker">Pricing</span>
          <h1>
            Pay for the claims <em>you trace.</em>
          </h1>
          <p>
            One credit finds real, published sources for one claim. Every account gets {FREE_MONTHLY_CREDITS} free credits a
            month; Scholar and Lab add more, billed monthly or annually.
          </p>
          <ul className="pr-assure">
            <li><Icon name="check" /> {FREE_MONTHLY_CREDITS} free credits every month</li>
            <li><Icon name="check" /> No card to start</li>
            <li><Icon name="check" /> Cancel any time</li>
          </ul>
        </header>

        <div className="wrap">
          <PlanPicker plans={shown} packs={packs} freeCredits={FREE_MONTHLY_CREDITS} />
        </div>

        <section className="pr-facts wrap" aria-label="How credits work">
          <div>
            <b>{CREDITS_PER_CLAIM}</b>
            <span>credit per claim</span>
            <p>Searched across every database you switch on. The trace button shows the cost first.</p>
          </div>
          <div>
            <b>{FREE_MONTHLY_CREDITS}</b>
            <span>free every month</span>
            <p>Refilled on the 1st, spent before paid credits. They don’t roll over.</p>
          </div>
          <div>
            <b>∞</b>
            <span>paid credits never expire</span>
            <p>Unused plan credits roll over for as long as you need them.</p>
          </div>
          <div>
            <b>0</b>
            <span>for a failed search</span>
            <p>If a trace stops or the databases can’t be reached, its credits come back.</p>
          </div>
        </section>

        <div className="wrap">
          <PlanEstimator
            tiers={[
              { key: 'free', name: 'Free', credits: FREE_MONTHLY_CREDITS },
              ...shown.map((p) => ({ key: p.key, name: p.name, credits: p.month?.credits ?? Math.round((p.year?.credits ?? 0) / 12) })),
            ]}
          />
        </div>

        <section className="pr-incl wrap" aria-labelledby="incl-title">
          <div className="pr-sec-head">
            <span className="kicker">Every plan</span>
            <h2 id="incl-title">
              Everything is included. <em>Only the credits change.</em>
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
