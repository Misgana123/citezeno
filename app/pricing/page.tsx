import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { PlanPicker } from '@/components/billing/PlanPicker';
import { Footer, Nav } from '@/components/Nav';
import { listPricing, polarEnabled } from '@/lib/polar';
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
      <main className="wrap page">
        <header className="price-head">
          <h1 className="h2">Pay for the claims you trace</h1>
          <p className="lede">
            One credit finds real sources for one claim. Every account gets {FREE_MONTHLY_CREDITS} free credits a month. Need
            more? Pick a plan, billed monthly or annually. Cancel any time.
          </p>
        </header>

        <div className="how">
          <div>
            <b>{CREDITS_PER_CLAIM} credit</b>
            <span>per claim searched, across every database you switch on</span>
          </div>
          <div>
            <b>{FREE_MONTHLY_CREDITS} free</b>
            <span>credits every month, refilled on the 1st</span>
          </div>
          <div>
            <b>Never expire</b>
            <span>purchased credits stay until you use them</span>
          </div>
        </div>

        <PlanPicker plans={plans} packs={packs} freeCredits={FREE_MONTHLY_CREDITS} />
        {!plans.length && !packs.length && (
          <p className="small" style={{ textAlign: 'center', marginTop: 24 }}>
            {polarEnabled ? 'Paid plans are being set up. Check back soon.' : 'Paid plans are coming soon.'}
          </p>
        )}

        <section className="faq">
          <h2 className="h3" style={{ fontSize: 26 }}>
            Questions
          </h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
          <p className="small" style={{ textAlign: 'center', marginTop: 24 }}>
            Payments are handled by Polar, our merchant of record, which also takes care of sales tax and VAT. Anything else?{' '}
            <Link href="/contact">Contact us</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
