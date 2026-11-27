import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/Nav';
import { pageMeta } from '@/lib/seo';
import '../legal.css';

export const metadata: Metadata = pageMeta({
  title: 'Terms of use',
  description: 'The terms for using Citezeno: accounts, credits and payments, your content, and what Citezeno can and can’t check.',
  path: '/terms',
});

const UPDATED = '5 November 2026';

/* One numbered clause, with a one-line "In short" note beside it. */
function Clause({ n, title, short, children }: { n: number; title: string; short: string; children: React.ReactNode }) {
  return (
    <section className="lg-clause" aria-labelledby={`clause-${n}`}>
      <span className="lg-num" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 id={`clause-${n}`}>{title}</h2>
        {children}
      </div>
      <aside className="lg-note">
        <b>In short</b>
        {short}
      </aside>
    </section>
  );
}

/* Plain-language terms. Review them with your own legal adviser before relying on them. */
export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="lg lg-terms">
        <header className="lg-thead wrap">
          <div>
            <span className="kicker">Terms of use</span>
            <h1>
              The terms, <em>clearly set out.</em>
            </h1>
          </div>
          <div className="lg-meta">
            <span className="lg-stamp">
              <i aria-hidden="true" /> Last updated {UPDATED}
            </span>
          </div>
        </header>

        <div className="wrap">
          <article className="lg-paper">
            <p className="lg-preamble">By using Citezeno you agree to these terms. If you don’t agree, please don’t use the service.</p>

            <Clause n={1} title="What Citezeno does, and doesn’t do" short="Check every source yourself before you rely on it.">
              <p>
                Citezeno finds published works in public databases that match the topic of the sentences in your draft, and
                formats them as citations. It matches by topic and does not read every work in full.
              </p>
              <p className="lg-warn">It cannot confirm that a source supports your sentence.</p>
              <p>
                You are responsible for opening each source, checking it says what you claim, and following your institution’s
                rules on citation and the use of AI.
              </p>
            </Clause>

            <Clause n={2} title="Your account" short="Real email, private password, delete any time.">
              <ul>
                <li>Give a real email address and keep your password private. You’re responsible for activity on your account.</li>
                <li>You must be old enough to agree to these terms where you live, or have a parent or guardian’s permission.</li>
                <li>You can delete your account at any time from the account page.</li>
              </ul>
            </Clause>

            <Clause n={3} title="Plans, credits and payments" short="Credits pay for searches and AI. They expire.">
              <ul>
                <li>Searching for sources uses credits: one per claim. The cost is shown before each trace.</li>
                <li>
                  The research assistant, deep research and the reader’s AI use credits for what they really cost. Credits are
                  set aside before such an action starts; you’re charged what it used and the rest is released. An action that
                  fails without giving you anything isn’t charged.
                </li>
                <li>
                  Credits expire. Plan credits end with the month of the plan they belong to (annual plans add theirs one month
                  at a time). Top-ups end 12 months after purchase. The credits that end soonest are used first. Credits have no
                  cash value and can’t be transferred.
                </li>
                <li>Each plan has limits (for example storage, saved traces and searches a day), shown on the pricing page.</li>
                <li>
                  Payments are processed by Polar as merchant of record, under its own terms. When a payment is refunded, the
                  credits it bought are removed from your balance.
                </li>
                <li>Deleting your account deletes any unused credits.</li>
                <li>We may change prices for future purchases. Credits you already have keep their value until they expire.</li>
              </ul>
            </Clause>

            <Clause n={4} title="Your content" short="Your drafts stay yours.">
              <p>
                Drafts you trace stay yours. You give us permission to store and process them only to provide the service to
                you, for example to keep your library in sync.
              </p>
            </Clause>

            <Clause n={5} title="Fair use" short="No abuse, overloading or spam.">
              <p>
                Don’t use Citezeno to break the law, to overload it or the databases it searches with automated requests, to
                get into other people’s accounts, or to send spam through the contact form. We may suspend accounts that do.
              </p>
            </Clause>

            <Clause n={6} title="Third-party data" short="Records can contain mistakes.">
              <p>
                Bibliographic records come from OpenAlex, Crossref, Open Library and Wikipedia under their own terms. They can
                contain mistakes. Check important details against the original publication.
              </p>
            </Clause>

            <Clause n={7} title="No warranty" short="Provided as is.">
              <p>
                Citezeno is provided “as is”. We work to keep it accurate and available, but we can’t promise it will be
                error-free or always online. To the extent the law allows, we aren’t liable for losses that come from relying
                on its output.
              </p>
            </Clause>

            <Clause n={8} title="Changes and contact" short="We change the date above whenever the terms change.">
              <p>
                We may update these terms and will change the date above when we do. Questions? <Link href="/contact">Contact us</Link>.
              </p>
            </Clause>

            <footer className="lg-sign">
              <span className="lg-seal">Citezeno</span>
              <span>Terms of use · version of {UPDATED}</span>
            </footer>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
