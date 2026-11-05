import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { BuyButton, FreePlanButton } from '@/components/billing/BuyButton';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { listPacks, polarEnabled, type CreditPack } from '@/lib/polar';
import { CREDITS_PER_CLAIM, FREE_MONTHLY_CREDITS } from '@/lib/pricing';
import { JsonLd } from '@/components/JsonLd';
import { appLd, faqLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Pricing: free monthly credits, pay only for what you cite',
  description: `Citezeno is free to start with ${FREE_MONTHLY_CREDITS} credits every month. One credit finds real sources for one claim. Buy credit packs that never expire, with no subscription.`,
  path: '/pricing',
});

// Static and refreshed every 5 minutes, so search engines and visitors get it fast.
// Whether the visitor is signed in is worked out in the browser.
export const revalidate = 300;

const packs = unstable_cache(listPacks, ['polar-packs'], { revalidate: 300 });

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

function perClaim(p: CreditPack) {
  const each = p.price / 100 / (p.credits / CREDITS_PER_CLAIM);
  const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency.toUpperCase(), maximumSignificantDigits: 2 });
  return `${f.format(each)} per claim`;
}

const FAQ = [
  ['What counts as one claim?', `Each sentence Citezeno searches sources for. A full trace uses one credit per claim it picks (the button shows the cost before you start), and “Cite this claim” uses ${CREDITS_PER_CLAIM}.`],
  ['What if a trace fails or I stop it?', 'If a trace stops before it finishes (you press Stop, or the databases can’t be reached), its credits are returned automatically.'],
  ['Do credits expire?', `Purchased credits never expire. The ${FREE_MONTHLY_CREDITS} free credits refill on the first of each month and don’t roll over. Free credits are always used first.`],
  ['Does anything else cost credits?', 'No. Switching styles, editing, replacing sources, exporting to Word or PDF and reopening saved traces are all free.'],
  ['Can I get a refund?', 'Contact us and we’ll sort it out. When a payment is refunded, the credits it bought are removed from your balance.'],
];

export default async function PricingPage() {
  const list = await packs();
  return (
    <>
      <JsonLd data={faqLd(FAQ as [string, string][])} />
      <JsonLd
        data={appLd({
          freeCredits: FREE_MONTHLY_CREDITS,
          ...(list.length ? { lowPrice: 0, highPrice: Math.max(...list.map((p) => p.price)) / 100, currency: list[0].currency } : {}),
        })}
      />
      <Nav />
      <main className="wrap page">
        <header className="price-head">
          <h1 className="h2">Pay for the claims you trace</h1>
          <p className="lede">
            One credit finds real sources for one claim. Every account gets {FREE_MONTHLY_CREDITS} free credits a month. Need
            more? Buy a pack. Nothing to cancel.
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

        <div className="plans">
          <section className="plan">
            <h2>Free</h2>
            <p className="desc">For trying Citezeno and the occasional essay.</p>
            <div className="amount">
              $0 <small>/ month</small>
            </div>
            <div className="per">{FREE_MONTHLY_CREDITS} credits every month</div>
            <ul>
              <li><Icon name="check" /> All 12 citation styles</li>
              <li><Icon name="check" /> Word, PDF, BibTeX and RIS export</li>
              <li><Icon name="check" /> Library synced to your account</li>
            </ul>
            <FreePlanButton />
          </section>

          {list.map((p) => (
            <section key={p.id} className={`plan${p.featured ? ' featured' : ''}`}>
              {p.featured && <span className="flag">Best value</span>}
              <h2>{p.name}</h2>
              <p className="desc">{p.description || (p.recurring ? 'Credits added every billing period.' : 'A one-time top-up.')}</p>
              <div className="amount">
                {money(p.price, p.currency)} {p.recurring && <small>/ {p.recurring}</small>}
              </div>
              <div className="per">
                {p.credits.toLocaleString()} credits{p.recurring ? ` every ${p.recurring}` : ''} · {perClaim(p)}
              </div>
              <ul>
                <li><Icon name="check" /> Everything in Free</li>
                <li><Icon name="check" /> {p.recurring ? 'Unused credits roll over' : 'Credits never expire'}</li>
                <li><Icon name="check" /> {p.recurring ? 'Cancel any time' : 'No subscription'}</li>
              </ul>
              <BuyButton productId={p.id} featured={p.featured} label={p.recurring ? 'Subscribe' : `Buy ${p.credits.toLocaleString()} credits`} />
            </section>
          ))}
        </div>

        {!list.length && (
          <p className="small" style={{ textAlign: 'center', marginTop: 24 }}>
            {polarEnabled ? 'Credit packs are being set up. Check back soon.' : 'Paid credit packs are coming soon.'}
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
